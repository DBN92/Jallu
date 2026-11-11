import { EventEmitter } from 'node:events';
import type { LitterBoxDto, LitterCatDto, LitterVisitDto } from '@luna/shared';
import type { Db } from '../../lib/db';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors';
import type { HomeAssistantRestClient } from '../../integrations/home-assistant/rest-client';
import type { HaState, HaStateChangedEvent } from '../../integrations/home-assistant/types';
import type { ActionLogService } from '../devices/action-log.service';
import type { Actor } from '../devices/devices.service';

/**
 * Caixa de areia automática (Smart Life/Tuya “cat litter box”, categoria msp no Home Assistant).
 * Entidades usadas (sufixos criados pela integração Tuya):
 *   sensor …_cat_weight · sensor …_excretion_times_day · sensor …_excretion_duration · sensor …_status
 *   button …_manual_clean · switch …_auto_clean · number …_delay_clean_time
 * O botão “restaurar padrões de fábrica” existe na integração, mas a Luna não usa de propósito.
 *
 * O Home Assistant só guarda o ÚLTIMO peso: a Luna registra cada visita quando o contador do dia
 * sobe (o peso pode repetir sem gerar evento) e reconhece o gato pelo peso.
 */

const SUFFIX = {
  weight: 'cat_weight',
  times: 'excretion_times_day',
  duration: 'excretion_duration',
  status: 'status',
  clean: 'manual_clean',
  auto: 'auto_clean',
  delay: 'delay_clean_time',
} as const;

const STATUS_LABEL: Record<string, string> = {
  standby: 'Pronta',
  clean: 'Limpando',
  empty: 'Esvaziando',
  level: 'Nivelando a areia',
  sleep: 'Dormindo',
  uv: 'Higienizando',
};

/** Diferença de peso aceita para ser o mesmo gato (kg). */
const SAME_CAT_KG = 0.35;
/** Até quanto longe ainda “provavelmente” é o gato mais próximo (kg). */
const MAYBE_CAT_KG = 0.8;
const CAT_COUNT = 6;

const num = (s: HaState | undefined) => {
  if (!s) return null;
  const v = Number(s.state);
  return Number.isFinite(v) ? v : null;
};

export class LitterService extends EventEmitter {
  private states = new Map<string, HaState>();
  private boxes: string[] = [];
  private lastRefresh = 0;
  private timer: NodeJS.Timeout | null = null;
  private alerted = new Map<string, string>(); // gato → dia do último aviso

  constructor(
    private readonly db: Db,
    private readonly ha: HomeAssistantRestClient,
    private readonly logs: ActionLogService,
    private readonly timezone: string,
    /** Relógio (os testes trocam para simular o tempo passando) */
    public now: () => Date = () => new Date(),
  ) {
    super();
  }

  // ---------------- Descoberta ----------------

  /** Encontra as caixas: cada sensor “…_cat_weight” é uma caixa (prefixo = o resto do nome). */
  async refresh(force = false) {
    if (!force && Date.now() - this.lastRefresh < 3000 && this.lastRefresh) return;
    const all = await this.ha.getStates();
    this.states = new Map(all.map((s) => [s.entity_id, s]));
    this.boxes = all
      .filter((s) => s.entity_id.startsWith('sensor.') && s.entity_id.endsWith(`_${SUFFIX.weight}`))
      .map((s) => s.entity_id.slice('sensor.'.length, -SUFFIX.weight.length - 1))
      .filter((p) => this.states.has(`sensor.${p}_${SUFFIX.times}`) || this.states.has(`button.${p}_${SUFFIX.clean}`))
      .sort();
    this.lastRefresh = Date.now();
  }

  private entity(prefix: string, domain: string, key: keyof typeof SUFFIX) {
    const id = `${domain}.${prefix}_${SUFFIX[key]}`;
    return { id, state: this.states.get(id) };
  }

  /** Todas as entidades das caixas: ficam fora da lista de aparelhos (a caixa tem cartão próprio). */
  async entityIds(): Promise<Set<string>> {
    await this.refresh().catch(() => undefined);
    const out = new Set<string>();
    for (const p of this.boxes) for (const id of this.states.keys()) if (id.split('.')[1]!.startsWith(`${p}_`)) out.add(id);
    return out;
  }

  // ---------------- Gatos e visitas ----------------

  private async cats() {
    let cats = await this.db.litterCat.findMany({ orderBy: { slot: 'asc' } });
    if (cats.length < CAT_COUNT) {
      for (let slot = 1; slot <= CAT_COUNT; slot++) {
        if (!cats.some((c) => c.slot === slot)) await this.db.litterCat.create({ data: { slot, name: `Gato ${slot}` } });
      }
      cats = await this.db.litterCat.findMany({ orderBy: { slot: 'asc' } });
    }
    return cats;
  }

  /** Reconhece o gato pelo peso; gatos ainda sem peso “aprendem” com a primeira visita diferente. */
  private async identify(weight: number | null): Promise<string | null> {
    if (weight === null || weight < 0.5) return null;
    const cats = await this.cats();
    const known = cats.filter((c) => c.weightKg !== null).sort((a, b) => Math.abs(a.weightKg! - weight) - Math.abs(b.weightKg! - weight));
    const near = known[0];
    if (near && Math.abs(near.weightKg! - weight) <= SAME_CAT_KG) {
      // Ajusta o peso de referência aos poucos (o gato engorda/emagrece), a não ser que o usuário tenha digitado
      if (!near.weightSet) await this.db.litterCat.update({ where: { id: near.id }, data: { weightKg: Math.round((near.weightKg! * 0.8 + weight * 0.2) * 100) / 100 } });
      return near.id;
    }
    const free = cats.find((c) => c.weightKg === null);
    if (free) {
      await this.db.litterCat.update({ where: { id: free.id }, data: { weightKg: Math.round(weight * 100) / 100 } });
      return free.id;
    }
    return near && Math.abs(near.weightKg! - weight) <= MAYBE_CAT_KG ? near.id : null;
  }

  /** Mudanças em tempo real do Home Assistant: registra visitas e avisa as telas. */
  async handleStateChanged(evt: HaStateChangedEvent) {
    if (!this.boxes.length) await this.refresh().catch(() => undefined);
    const prefix = this.boxes.find((p) => evt.entity_id.split('.')[1]?.startsWith(`${p}_`));
    if (!prefix) return;
    if (evt.new_state) this.states.set(evt.entity_id, evt.new_state);
    const objectId = evt.entity_id.split('.')[1]!;
    const key = objectId.slice(prefix.length + 1);
    if (key === SUFFIX.times) {
      const before = num(evt.old_state ?? undefined);
      const after = num(evt.new_state ?? undefined);
      // Só quando o contador SOBE (meia-noite ele volta a zero)
      if (before !== null && after !== null && after > before) {
        const weight = num(this.entity(prefix, 'sensor', 'weight').state);
        const duration = num(this.entity(prefix, 'sensor', 'duration').state);
        const durationS = duration === null ? null : Math.round(duration);
        // UMA visita por aviso, mesmo se o contador pular (ex.: 3 → 6): só há um peso e uma
        // duração, ou seja, um gato. Contar o pulo inteiro duplicava a visita.
        // E o mesmo aviso repetido logo em seguida (mesmo peso e duração) não conta de novo.
        const last = await this.db.litterVisit.findFirst({ where: { boxId: prefix }, orderBy: { at: 'desc' } });
        const repeated = last && this.now().getTime() - last.at.getTime() < 90_000 && last.weightKg === weight && last.durationS === durationS;
        if (!repeated) {
          await this.db.litterVisit.create({ data: { boxId: prefix, at: this.now(), weightKg: weight, durationS, catId: await this.identify(weight) } });
        }
      }
    } else if (key === SUFFIX.weight || key === SUFFIX.duration) {
      // O peso/duração podem chegar logo DEPOIS do contador (atraso da nuvem): até 8 s, pertencem à
      // visita recém-registrada. Depois disso são do PRÓXIMO gato (com 6 gatos, um pode entrar logo em
      // seguida) e só ficam guardados para quando o contador subir de novo.
      const last = await this.db.litterVisit.findFirst({ where: { boxId: prefix }, orderBy: { at: 'desc' } });
      if (last && this.now().getTime() - last.at.getTime() < 8_000) {
        const v = num(evt.new_state ?? undefined);
        if (key === SUFFIX.weight && v !== null && v !== last.weightKg) {
          await this.db.litterVisit.update({ where: { id: last.id }, data: { weightKg: v, catId: await this.identify(v) } });
        } else if (key === SUFFIX.duration && v !== null) {
          await this.db.litterVisit.update({ where: { id: last.id }, data: { durationS: Math.round(v) } });
        }
      }
    }
    this.emit('update', prefix);
  }

  // ---------------- Leitura ----------------

  private day(d: Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }

  async list(): Promise<LitterBoxDto[]> {
    await this.refresh();
    const out: LitterBoxDto[] = [];
    for (const p of this.boxes) out.push(await this.dto(p));
    return out;
  }

  async get(prefix: string): Promise<LitterBoxDto> {
    await this.refresh();
    if (!this.boxes.includes(prefix)) throw notFound('Caixa de areia não encontrada no Home Assistant.');
    return this.dto(prefix);
  }

  private visitDto(v: { id: string; at: Date; weightKg: number | null; durationS: number | null; catId: string | null }, names: Map<string, string>): LitterVisitDto {
    return { id: v.id, at: v.at.toISOString(), weightKg: v.weightKg, durationS: v.durationS, catId: v.catId, catName: v.catId ? (names.get(v.catId) ?? null) : null };
  }

  private async dto(p: string): Promise<LitterBoxDto> {
    const weight = this.entity(p, 'sensor', 'weight');
    const status = this.entity(p, 'sensor', 'status').state?.state ?? 'unknown';
    const auto = this.entity(p, 'switch', 'auto');
    const delay = this.entity(p, 'number', 'delay');
    const clean = this.entity(p, 'button', 'clean');
    const times = this.entity(p, 'sensor', 'times');
    const available = !!weight.state && weight.state.state !== 'unavailable';
    const pref = await this.db.litterBoxPref.findUnique({ where: { id: p } });

    const cats = await this.cats();
    const names = new Map(cats.map((c) => [c.id, c.name]));
    const now = this.now();
    const since = new Date(now.getTime() - 8 * 86_400_000);
    const visits = await this.db.litterVisit.findMany({ where: { boxId: p, at: { gte: since } }, orderBy: { at: 'desc' } });
    const first = await this.db.litterVisit.findFirst({ where: { boxId: p }, orderBy: { at: 'asc' } });
    const today = this.day(now);
    const week: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = this.day(new Date(now.getTime() - i * 86_400_000));
      week.push({ date, count: visits.filter((v) => this.day(v.at) === date).length });
    }
    // O contador da própria caixa pula (ex.: 3 → 6 numa visita só): os números da tela usam as
    // visitas que a Luna registrou, as mesmas da lista por gato, para baterem entre si.
    const sensorToday = num(times.state);

    const historyAge = first ? now.getTime() - first.at.getTime() : 0;
    const catDtos: LitterCatDto[] = [];
    for (const c of cats) {
      const mine = visits.filter((v) => v.catId === c.id);
      const last = mine[0]?.at ?? (await this.db.litterVisit.findFirst({ where: { catId: c.id }, orderBy: { at: 'desc' } }))?.at ?? null;
      let alert: string | null = null;
      // Só avisa de gatos já conhecidos e quando a Luna já registra há mais de 24 h
      if (c.weightKg !== null && historyAge > 86_400_000 && (!last || now.getTime() - last.getTime() > 86_400_000)) {
        alert = `${c.name} não usa a caixa há mais de 24 h.`;
      }
      catDtos.push({ id: c.id, slot: c.slot, name: c.name, weightKg: c.weightKg, weightSet: c.weightSet, todayVisits: mine.filter((v) => this.day(v.at) === today).length, lastVisitAt: last?.toISOString() ?? null, alert });
    }

    const statusLabel = !available ? 'Indisponível' : (STATUS_LABEL[status] ?? 'Disponível');
    const haName = String(weight.state?.attributes.friendly_name ?? '').replace(/\s*cat weight\s*$/i, '').trim();
    return {
      id: p,
      name: this.boxes.length === 1 ? 'Caixa de areia' : haName || 'Caixa de areia',
      available,
      status,
      statusLabel,
      autoClean: auto.state && auto.state.state !== 'unavailable' ? auto.state.state === 'on' : null,
      delaySeconds: num(delay.state),
      delayMax: delay.state ? Number(delay.state.attributes.max ?? 600) : null,
      canClean: !!clean.state && clean.state.state !== 'unavailable',
      todayCount: sensorToday,
      lastVisit: visits[0] ? this.visitDto(visits[0], names) : null,
      week,
      historySince: first?.at.toISOString() ?? null,
      recent: visits.slice(0, 10).map((v) => this.visitDto(v, names)),
      cats: catDtos,
      voiceAllowed: pref?.voiceAllowed ?? false,
    };
  }

  // ---------------- Comandos ----------------

  private guard(prefix: string, actor: Actor, voiceAllowed: boolean) {
    if (!this.boxes.includes(prefix)) throw notFound('Caixa de areia não encontrada no Home Assistant.');
    if ((actor.source.startsWith('ai:') || actor.source === 'voice') && !voiceAllowed) {
      throw forbidden('A caixa de areia não está autorizada para comandos de voz. Autorize na tela da caixa, em “Luna pode controlar pela voz”.');
    }
  }

  async clean(prefix: string, actor: Actor): Promise<LitterBoxDto> {
    await this.refresh(true);
    const pref = await this.db.litterBoxPref.findUnique({ where: { id: prefix } });
    this.guard(prefix, actor, pref?.voiceAllowed ?? false);
    const b = this.entity(prefix, 'button', 'clean');
    if (!b.state || b.state.state === 'unavailable') throw new AppError(409, 'A caixa de areia está indisponível agora.', 'device_unavailable');
    try {
      await this.ha.callService('button', 'press', { entity_id: b.id });
      await this.logs.log({ userId: actor.userId, source: actor.source, tool: 'litter_clean', target: b.id, args: {}, success: true, detail: 'limpeza manual' });
    } catch (err) {
      await this.logs.log({ userId: actor.userId, source: actor.source, tool: 'litter_clean', target: b.id, args: {}, success: false, detail: (err as Error).message });
      throw err;
    }
    this.emit('update', prefix);
    return this.dto(prefix);
  }

  async setAuto(prefix: string, on: boolean, delaySeconds: number | undefined, actor: Actor): Promise<LitterBoxDto> {
    await this.refresh(true);
    const pref = await this.db.litterBoxPref.findUnique({ where: { id: prefix } });
    this.guard(prefix, actor, pref?.voiceAllowed ?? false);
    const sw = this.entity(prefix, 'switch', 'auto');
    if (!sw.state) throw badRequest('Esta caixa não tem limpeza automática no Home Assistant.');
    const delay = this.entity(prefix, 'number', 'delay');
    if (delaySeconds !== undefined) {
      if (!delay.state) throw badRequest('Esta caixa não permite ajustar a espera antes de limpar.');
      const min = Number(delay.state.attributes.min ?? 1);
      const max = Number(delay.state.attributes.max ?? 600);
      const value = Math.max(min, Math.min(max, Math.round(delaySeconds)));
      await this.ha.callService('number', 'set_value', { entity_id: delay.id, value });
      this.states.set(delay.id, { ...delay.state, state: String(value) });
    }
    await this.ha.callService('switch', on ? 'turn_on' : 'turn_off', { entity_id: sw.id });
    this.states.set(sw.id, { ...sw.state, state: on ? 'on' : 'off' });
    await this.logs.log({ userId: actor.userId, source: actor.source, tool: 'litter_auto', target: sw.id, args: { on, delaySeconds }, success: true, detail: on ? 'limpeza automática ligada' : 'limpeza automática desligada' });
    this.emit('update', prefix);
    return this.dto(prefix);
  }

  async setVoice(prefix: string, allowed: boolean) {
    await this.refresh();
    if (!this.boxes.includes(prefix)) throw notFound('Caixa de areia não encontrada no Home Assistant.');
    await this.db.litterBoxPref.upsert({ where: { id: prefix }, create: { id: prefix, voiceAllowed: allowed }, update: { voiceAllowed: allowed } });
    return this.dto(prefix);
  }

  async updateCat(id: string, patch: { name?: string; weightKg?: number | null }) {
    const cat = await this.db.litterCat.findUnique({ where: { id } });
    if (!cat) throw notFound('Gato não encontrado.');
    await this.db.litterCat.update({
      where: { id },
      data: {
        name: patch.name ?? undefined,
        ...(patch.weightKg === undefined ? {} : patch.weightKg === null ? { weightKg: null, weightSet: false } : { weightKg: patch.weightKg, weightSet: true }),
      },
    });
    this.emit('update', null);
    return this.list();
  }

  /** Frase para a voz: “Hoje a caixa foi usada 9 vezes. Última visita às 13:02, Gato 1.” */
  async statusText(): Promise<string> {
    const boxes = await this.list();
    if (!boxes.length) return 'Não encontrei a caixa de areia no Home Assistant.';
    const b = boxes[0]!;
    const n = b.week[6]!.count;
    const parts = [`Hoje a caixa de areia foi usada ${n === 0 ? 'nenhuma vez' : n === 1 ? '1 vez' : `${n} vezes`}.`];
    if (b.lastVisit) {
      const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: this.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(b.lastVisit.at));
      parts.push(`Última visita às ${hora}${b.lastVisit.catName ? `, ${b.lastVisit.catName}` : ''}.`);
    }
    if (b.autoClean === false) parts.push('A limpeza automática está desligada.');
    const alerts = b.cats.map((c) => c.alert).filter(Boolean);
    if (alerts.length) parts.push(alerts.join(' '));
    return parts.join(' ');
  }

  // ---------------- Avisos periódicos ----------------

  /**
   * Apaga visitas duplicadas gravadas pela versão anterior (mesmo segundo, peso e duração —
   * vinham de pulos do contador). Mantém a primeira de cada grupo. Devolve quantas apagou.
   */
  async removeDuplicates(): Promise<number> {
    const all = await this.db.litterVisit.findMany({ orderBy: { at: 'asc' } });
    const seen = new Set<string>();
    const dup: string[] = [];
    for (const v of all) {
      const key = `${v.boxId}|${Math.floor(v.at.getTime() / 1000)}|${v.weightKg}|${v.durationS}`;
      if (seen.has(key)) dup.push(v.id);
      else seen.add(key);
    }
    if (dup.length) {
      await this.db.litterVisit.deleteMany({ where: { id: { in: dup } } });
      this.emit('update', null);
    }
    return dup.length;
  }

  start() {
    void this.removeDuplicates().catch(() => undefined);
    if (this.timer) return;
    const tick = async () => {
      try {
        for (const b of await this.list()) {
          for (const c of b.cats) {
            if (!c.alert || this.alerted.get(c.id) === this.day(this.now())) continue;
            this.alerted.set(c.id, this.day(this.now()));
            this.emit('alert', `🐾 ${c.alert}`);
          }
        }
      } catch {
        /* Home Assistant fora do ar: tenta de novo depois */
      }
    };
    this.timer = setInterval(() => void tick(), 30 * 60_000);
    this.timer.unref();
    setTimeout(() => void tick(), 60_000).unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
