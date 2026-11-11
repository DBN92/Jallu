import { EventEmitter } from 'node:events';
import type { WasherDto, WasherStepDto } from '@luna/shared';
import type { Db } from '../../lib/db';
import { AppError, forbidden, notFound } from '../../lib/errors';
import type { HomeAssistantRestClient } from '../../integrations/home-assistant/rest-client';
import type { HaState, HaStateChangedEvent } from '../../integrations/home-assistant/types';
import type { ActionLogService } from '../devices/action-log.service';
import type { Actor } from '../devices/devices.service';

/**
 * Lava e seca Midea pela integração Midea AC LAN (aparelho tipo DB, lava e seca de abertura frontal).
 * As entidades usam o número do aparelho como prefixo, por exemplo sensor.149533581394056_time_remaining.
 * Entidades usadas:
 *   sensor …_status · …_progress · …_time_remaining · …_program · …_temperature · …_dehydration_speed
 *   sensor …_wash_time_value · …_dehydration_time_value · switch …_power · switch …_start
 * A máquina não informa consumo de água/energia nem a porta: a Luna não mostra nem inventa esses dados.
 */

const S = {
  status: 'status',
  progress: 'progress',
  remaining: 'time_remaining',
  program: 'program',
  temperature: 'temperature',
  spin: 'dehydration_speed',
  washMin: 'wash_time_value',
  spinMin: 'dehydration_time_value',
  power: 'power',
  start: 'start',
} as const;

/** Etapa informada pela máquina → etapa da barra (lavar, enxaguar, centrifugar, secar). */
const STAGE_STEP: Record<string, WasherStepDto['key']> = {
  pre_wash: 'wash',
  weight: 'wash',
  wash: 'wash',
  rinse: 'rinse',
  spin: 'spin',
  hi_speed_spin: 'spin',
  dry: 'dry',
};
const STAGE_LABEL: Record<string, string> = {
  pre_wash: 'Pré-lavagem',
  weight: 'Pesando a roupa',
  wash: 'Lavando',
  rinse: 'Enxaguando',
  spin: 'Centrifugando',
  hi_speed_spin: 'Centrifugando',
  dry: 'Secando',
};
const STEPS: { key: WasherStepDto['key']; label: string }[] = [
  { key: 'wash', label: 'Lavar' },
  { key: 'rinse', label: 'Enxaguar' },
  { key: 'spin', label: 'Centrifugar' },
  { key: 'dry', label: 'Secar' },
];

/** Programas conhecidos (nomes da integração) em português. Os outros aparecem pelo número. */
const PROGRAM: Record<string, string> = {
  cotton: 'Algodão',
  eco: 'Eco',
  fast_wash: 'Rápido',
  quick_wash: 'Rápido',
  fast_wash_30: 'Rápido 30 min',
  fast_wash_60: 'Rápido 60 min',
  mixed_wash: 'Misto',
  fiber: 'Sintéticos',
  wool: 'Lã',
  sport_clothes: 'Roupas esportivas',
  single_dehytration: 'Só centrifugar',
  rinsing_dehydration: 'Enxaguar e centrifugar',
  big: 'Peças grandes',
  bulky: 'Peças grandes',
  baby_clothes: 'Roupas de bebê',
  kids: 'Roupas infantis',
  outdoor: 'Roupas de inverno',
  air_wash: 'Ar',
  down_jacket: 'Edredom',
  color: 'Coloridas',
  intelligent: 'Inteligente',
  single_drying: 'Só secar',
  shirt: 'Camisas',
  steep: 'Molho',
  jean: 'Jeans',
  silk: 'Seda',
  silk_wash: 'Seda',
  bath_towel: 'Toalhas',
  jacket: 'Jaquetas',
  cold_wash: 'Água fria',
  allergy_care: 'Antialérgico',
  prevent_allergy: 'Antialérgico',
  steam_care: 'Vapor',
  wash_drying_60: 'Lavar e secar 60 min',
  wash_and_dry: 'Lavar e secar',
  time_dry: 'Secar por tempo',
  fast_dry: 'Secagem rápida',
  self_wash_5: 'Limpeza do cesto',
  standard: 'Padrão',
  mink: 'Pelúcia',
  fresh_air: 'Refrescar',
  sterilize_wash: 'Higienizar',
  steam_sterilize_wash: 'Higienizar com vapor',
};
const DRY_PROGRAM = /dry|drying/;

const STATUS_LABEL: Record<string, string> = {
  idle: 'Desligada',
  standby: 'Pronta para começar',
  pause: 'Pausada',
  end: 'Terminou',
  fault: 'Com erro',
  delay: 'Início agendado',
};

const num = (s: HaState | undefined) => {
  if (!s) return null;
  const v = Number(s.state);
  return Number.isFinite(v) ? v : null;
};
const known = (s: HaState | undefined) => !!s && s.state !== 'unavailable' && s.state !== 'unknown';

export const minutesText = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  if (!h) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, '0')} min` : `${h} h`;
};

export class WasherService extends EventEmitter {
  private states = new Map<string, HaState>();
  private washers: string[] = [];
  private lastRefresh = 0;
  /** O ciclo atual passou pela secagem (mostra a etapa “Secar” mesmo em programa desconhecido) */
  private sawDry = new Set<string>();

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

  /** Cada sensor “…_time_remaining” com “…_progress” e “…_status” ao lado é uma lavadora. */
  async refresh(force = false) {
    if (!force && Date.now() - this.lastRefresh < 3000 && this.lastRefresh) return;
    const all = await this.ha.getStates();
    this.states = new Map(all.map((s) => [s.entity_id, s]));
    this.washers = all
      .filter((s) => s.entity_id.startsWith('sensor.') && s.entity_id.endsWith(`_${S.remaining}`))
      .map((s) => s.entity_id.slice('sensor.'.length, -S.remaining.length - 1))
      .filter((p) => this.states.has(`sensor.${p}_${S.progress}`) && this.states.has(`sensor.${p}_${S.status}`))
      .sort();
    this.lastRefresh = Date.now();
  }

  private st(p: string, domain: string, key: keyof typeof S) {
    const id = `${domain}.${p}_${S[key]}`;
    return { id, state: this.states.get(id) };
  }

  /** Entidades das lavadoras: ficam fora da lista de aparelhos (a máquina tem cartão próprio). */
  async entityIds(): Promise<Set<string>> {
    await this.refresh().catch(() => undefined);
    const out = new Set<string>();
    for (const p of this.washers) for (const id of this.states.keys()) if (id.split('.')[1]!.startsWith(`${p}_`)) out.add(id);
    return out;
  }

  // ---------------- Ciclos ----------------

  private openCycle(p: string) {
    return this.db.washerCycle.findFirst({ where: { washerId: p, endedAt: null }, orderBy: { startedAt: 'desc' } });
  }

  private programName(p: string) {
    const raw = this.st(p, 'sensor', 'program').state?.state ?? '';
    if (!raw || raw === 'unknown' || raw === 'unavailable' || raw === 'default') return '';
    if (PROGRAM[raw]) return PROGRAM[raw]!;
    if (/^\d+$/.test(raw)) return `Programa ${raw}`;
    return raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }

  /** Mudanças em tempo real do Home Assistant: acompanha o ciclo e avisa quando termina. */
  async handleStateChanged(evt: HaStateChangedEvent) {
    if (!this.washers.length) await this.refresh().catch(() => undefined);
    const p = this.washers.find((w) => evt.entity_id.split('.')[1]?.startsWith(`${w}_`));
    if (!p) return;
    const before = this.states.get(evt.entity_id) ?? evt.old_state ?? undefined;
    if (evt.new_state) this.states.set(evt.entity_id, evt.new_state);
    const key = evt.entity_id.split('.')[1]!.slice(p.length + 1);

    if (key === S.progress && evt.new_state?.state === 'dry') this.sawDry.add(p);
    if (key === S.status && evt.new_state) {
      const from = evt.old_state?.state ?? before?.state;
      const to = evt.new_state.state;
      if (from && from !== to) await this.statusChanged(p, from, to, num(this.st(p, 'sensor', 'remaining').state));
    }
    this.emit('update', p);
  }

  private async statusChanged(p: string, from: string, to: string, remaining: number | null) {
    const running = (s: string) => s === 'start' || s === 'pause';
    const open = await this.openCycle(p);
    // Começou: de parada (pronta, desligada, agendada, terminou) para lavando
    if (to === 'start' && !running(from)) {
      if (!open) await this.db.washerCycle.create({ data: { washerId: p, startedAt: this.now(), program: this.programName(p) || null } });
      this.sawDry.delete(p);
      return;
    }
    // Terminou: a máquina avisa “end”; ou volta a pronta/desligada com o tempo zerado
    const finished = to === 'end' || (running(from) && (to === 'standby' || to === 'idle') && remaining !== null && remaining <= 2);
    if (finished && from !== 'end' && (running(from) || open)) {
      await this.finish(p, open?.id ?? null, true);
      return;
    }
    // Desligada ou cancelada no meio: fecha o ciclo sem aviso
    if (open && (to === 'idle' || to === 'standby') && running(from)) {
      await this.db.washerCycle.update({ where: { id: open.id }, data: { endedAt: this.now(), done: false } });
    }
  }

  private async finish(p: string, openId: string | null, notify: boolean) {
    const now = this.now();
    const cycle = openId
      ? await this.db.washerCycle.update({ where: { id: openId }, data: { endedAt: now, done: true } })
      : await this.db.washerCycle.create({ data: { washerId: p, startedAt: null, endedAt: now, done: true, program: this.programName(p) || null } });
    this.sawDry.delete(p);
    if (!notify) return;
    const pref = await this.pref(p);
    if (!pref.notifyDone) return;
    const took = cycle.startedAt ? Math.round((now.getTime() - cycle.startedAt.getTime()) / 60_000) : null;
    const what = [cycle.program, took ? minutesText(took) : null].filter(Boolean).join(', ');
    this.emit('done', {
      text: `👕 Roupa pronta! A lava e seca terminou${what ? ` (${what})` : ''}.`,
      speech: 'A roupa está pronta! A lava e seca terminou.',
      speak: pref.speak,
    });
  }

  private async pref(p: string) {
    return (await this.db.washerPref.findUnique({ where: { id: p } })) ?? { id: p, voiceAllowed: false, notifyDone: true, speak: true };
  }

  // ---------------- Leitura ----------------

  async list(): Promise<WasherDto[]> {
    await this.refresh();
    const out: WasherDto[] = [];
    for (const p of this.washers) out.push(await this.dto(p));
    return out;
  }

  async get(p: string): Promise<WasherDto> {
    await this.refresh();
    if (!this.washers.includes(p)) throw notFound('Lava e seca não encontrada no Home Assistant.');
    return this.dto(p);
  }

  private async dto(p: string): Promise<WasherDto> {
    const statusS = this.st(p, 'sensor', 'status').state;
    const status = statusS?.state ?? 'unknown';
    const available = !!statusS && status !== 'unavailable';
    const powerS = this.st(p, 'switch', 'power').state;
    const startS = this.st(p, 'switch', 'start').state;
    const power = powerS ? powerS.state === 'on' : status !== 'idle';
    const stage = this.st(p, 'sensor', 'progress').state?.state ?? 'unknown';
    const running = status === 'start' || status === 'delay';
    const paused = status === 'pause';
    const active = running || paused;
    const remaining = num(this.st(p, 'sensor', 'remaining').state);
    const program = this.programName(p);
    const programRaw = this.st(p, 'sensor', 'program').state?.state ?? '';

    // Barra de etapas: “Secar” só em programa com secagem (ou se a máquina já passou por ela)
    const current = active ? STAGE_STEP[stage] : undefined;
    const withDry = DRY_PROGRAM.test(programRaw) || this.sawDry.has(p) || current === 'dry';
    const list = STEPS.filter((s) => s.key !== 'dry' || withDry);
    const idx = current ? list.findIndex((s) => s.key === current) : -1;
    const steps: WasherStepDto[] = list.map((s, i) => ({
      key: s.key,
      label: s.label,
      state: status === 'end' ? 'done' : idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'current' : 'todo',
    }));

    let statusLabel: string;
    if (!available) statusLabel = 'Indisponível';
    else if (!power) statusLabel = 'Desligada';
    else if (status === 'start') statusLabel = STAGE_LABEL[stage] ?? 'Lavando';
    else statusLabel = STATUS_LABEL[status] ?? 'Ligada';

    // Ciclo atual: só o que a máquina informa (nada de consumo, que ela não manda)
    const details: { label: string; value: string }[] = [];
    if (program) details.push({ label: 'Programa', value: program });
    const temp = this.st(p, 'sensor', 'temperature').state?.state;
    if (temp && temp !== 'unknown' && temp !== 'unavailable') details.push({ label: 'Temperatura', value: temp === 'default' ? 'Padrão' : temp === '0' ? 'Água fria' : `${temp} °C` });
    const spin = this.st(p, 'sensor', 'spin').state?.state;
    if (spin && spin !== 'unknown' && spin !== 'unavailable') details.push({ label: 'Centrifugação', value: spin === 'default' ? 'Padrão' : spin === '0' ? 'Sem centrifugar' : `${spin} rpm` });
    const washMin = num(this.st(p, 'sensor', 'washMin').state);
    if (washMin) details.push({ label: 'Tempo de lavagem', value: minutesText(washMin) });
    const spinMin = num(this.st(p, 'sensor', 'spinMin').state);
    if (spinMin) details.push({ label: 'Tempo de centrifugação', value: minutesText(spinMin) });

    const now = this.now();
    const open = await this.openCycle(p);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const doneCycles = await this.db.washerCycle.findMany({ where: { washerId: p, done: true, endedAt: { gte: new Date(now.getTime() - 60 * 86_400_000) } }, orderBy: { endedAt: 'desc' } });
    const timed = doneCycles.filter((c) => c.startedAt && c.endedAt).slice(0, 10).map((c) => (c.endedAt!.getTime() - c.startedAt!.getTime()) / 60_000);
    const pref = await this.pref(p);
    const haName = String(statusS?.attributes.friendly_name ?? '').replace(/\s*status\s*$/i, '').trim();

    return {
      id: p,
      name: this.washers.length === 1 ? 'Lava e seca' : haName || 'Lava e seca',
      available,
      power,
      status,
      statusLabel,
      running,
      paused,
      stage,
      steps,
      remainingMin: power && remaining !== null && status !== 'end' ? remaining : null,
      endsAt: status === 'start' && remaining !== null ? new Date(now.getTime() + remaining * 60_000).toISOString() : null,
      startedAt: active && open?.startedAt ? open.startedAt.toISOString() : null,
      program,
      details,
      canPower: known(powerS),
      canStart: known(startS),
      weekCycles: doneCycles.filter((c) => c.endedAt! >= weekAgo).length,
      avgMinutes: timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : null,
      lastDoneAt: doneCycles[0]?.endedAt?.toISOString() ?? null,
      notifyDone: pref.notifyDone,
      speak: pref.speak,
      voiceAllowed: pref.voiceAllowed,
    };
  }

  // ---------------- Comandos ----------------

  private async guard(p: string, actor: Actor) {
    await this.refresh(true);
    if (!this.washers.includes(p)) throw notFound('Lava e seca não encontrada no Home Assistant.');
    const pref = await this.pref(p);
    if ((actor.source.startsWith('ai:') || actor.source === 'voice') && !pref.voiceAllowed) {
      throw forbidden('A lava e seca não está autorizada para comandos de voz. Autorize na tela da máquina, em “Luna pode controlar pela voz”.');
    }
  }

  private async toggle(p: string, key: 'power' | 'start', on: boolean, actor: Actor, detail: string) {
    const sw = this.st(p, 'switch', key);
    if (!known(sw.state)) throw new AppError(409, 'A lava e seca não responde agora. Confira se ela está ligada na tomada e no Wi-Fi.', 'device_unavailable');
    try {
      await this.ha.callService('switch', on ? 'turn_on' : 'turn_off', { entity_id: sw.id });
      this.states.set(sw.id, { ...sw.state!, state: on ? 'on' : 'off' });
      await this.logs.log({ userId: actor.userId, source: actor.source, tool: 'washer', target: sw.id, args: { on }, success: true, detail });
    } catch (err) {
      await this.logs.log({ userId: actor.userId, source: actor.source, tool: 'washer', target: sw.id, args: { on }, success: false, detail: (err as Error).message });
      throw err;
    }
    this.emit('update', p);
  }

  /** Liga ou desliga o painel da máquina. */
  async setPower(p: string, on: boolean, actor: Actor): Promise<WasherDto> {
    await this.guard(p, actor);
    await this.toggle(p, 'power', on, actor, on ? 'ligar' : 'desligar');
    return this.dto(p);
  }

  /** Começa/continua (on) ou pausa (off) o programa escolhido no painel. */
  async setRunning(p: string, on: boolean, actor: Actor): Promise<WasherDto> {
    await this.guard(p, actor);
    const power = this.st(p, 'switch', 'power').state;
    if (on && power && power.state === 'off') throw new AppError(409, 'A lava e seca está desligada. Ligue a máquina e escolha o programa no painel primeiro.', 'device_off');
    await this.toggle(p, 'start', on, actor, on ? 'começar/continuar' : 'pausar');
    return this.dto(p);
  }

  async setPrefs(p: string, patch: { notifyDone?: boolean; speak?: boolean }) {
    await this.refresh();
    if (!this.washers.includes(p)) throw notFound('Lava e seca não encontrada no Home Assistant.');
    await this.db.washerPref.upsert({ where: { id: p }, create: { id: p, ...patch }, update: patch });
    this.emit('update', p);
    return this.dto(p);
  }

  async setVoice(p: string, allowed: boolean) {
    await this.refresh();
    if (!this.washers.includes(p)) throw notFound('Lava e seca não encontrada no Home Assistant.');
    await this.db.washerPref.upsert({ where: { id: p }, create: { id: p, voiceAllowed: allowed }, update: { voiceAllowed: allowed } });
    return this.dto(p);
  }

  private hour(iso: string) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: this.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  /** Frase para a voz: “A lava e seca está enxaguando. Faltam 42 minutos, termina às 15:20.” */
  async statusText(): Promise<string> {
    const list = await this.list();
    if (!list.length) return 'Não encontrei a lava e seca no Home Assistant.';
    const w = list[0]!;
    if (!w.available) return 'A lava e seca não está respondendo agora.';
    if (!w.power) return w.lastDoneAt ? `A lava e seca está desligada. O último ciclo terminou às ${this.hour(w.lastDoneAt)}.` : 'A lava e seca está desligada.';
    const left = w.remainingMin !== null ? (w.remainingMin === 1 ? '1 minuto' : `${w.remainingMin} minutos`) : null;
    if (w.status === 'start') return `A lava e seca está ${w.statusLabel.toLowerCase()}.${left ? ` Faltam ${left}` : ''}${w.endsAt ? `, termina às ${this.hour(w.endsAt)}.` : left ? '.' : ''}`;
    if (w.status === 'pause') return `A lava e seca está pausada.${left ? ` Faltam ${left} de ciclo.` : ''}`;
    if (w.status === 'end') return 'A lava e seca já terminou. A roupa está pronta.';
    if (w.status === 'delay') return `A lava e seca está com início agendado.${left ? ` O programa dura ${left}.` : ''}`;
    if (w.status === 'fault') return 'A lava e seca está mostrando um erro. Confira o painel dela.';
    return `A lava e seca está ligada e pronta para começar${w.program ? `, no ${w.program}` : ''}.`;
  }
}
