import { EventEmitter } from 'node:events';
import type { DeviceDto, VacuumCommand } from '@luna/shared';
import type { Db } from '../../lib/db';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors';
import { normalize, safeJson, significantTokens } from '../../lib/text';
import type { HomeAssistantRestClient } from '../../integrations/home-assistant/rest-client';
import type { HaState, HaStateChangedEvent } from '../../integrations/home-assistant/types';
import type { ActionLogService } from './action-log.service';
import { CONTROLLABLE_DOMAINS, SUPPORTED_DOMAINS, domainOf, toDeviceDto } from './categorize';
import { buildExtras, parseCompanion } from './vacuum-extras';

/** Entidades do robô que mudam o tempo todo e não aparecem na Luna (mapa, logs…): não geram atualização. */
const NOISY_COMPANIONS = new Set(['map_data', 'object_name', 'robot_time', 'result_code', 'clean_log_filename', 'voice_change_state', 'clean_extend_data', 'remote_state', 'clean_start_time', 'relocation_status']);

/** Quem está pedindo a ação. Ações vindas da IA exigem dispositivo autorizado para IA. */
export interface Actor {
  source: 'ui' | 'voice' | `ai:${string}` | 'automation' | 'gesture';
  userId?: string | null;
}

interface Meta {
  aiAllowed: boolean;
  aliases: string[];
  hidden: boolean;
  customName: string | null;
}

export interface DeviceMatch {
  device: DeviceDto;
  score: number;
}

const ENTITY_ID_RE = /^[a-z_]+\.[a-z0-9_]+$/;

export class DevicesService extends EventEmitter {
  private states = new Map<string, HaState>();
  private meta = new Map<string, Meta>();
  private lastFullRefresh = 0;
  private readonly autoAuthorize: Set<string>;
  /** Fornece as entidades ocultas pelo Home Assistant (registro de entidades). */
  private hiddenProvider: () => Promise<Set<string>> = async () => new Set();
  /** Registro de entidades do HA: a qual aparelho físico cada entidade pertence. */
  private registryProvider: () => Promise<Map<string, { deviceId: string | null }>> = async () => new Map();
  /**
   * Entidades “acessórias” de um aspirador (bateria, escovas, interruptores de config…).
   * Integrações como a Xiaomi Home criam dezenas delas; ficam fora da lista de aparelhos.
   * entity_id da acessória → entity_id do aspirador
   */
  private companions = new Map<string, string>();
  private companionStates = new Map<string, HaState>();
  /** aspirador → sensor de bateria do mesmo aparelho */
  private batteryOf = new Map<string, string>();

  /** Versão da foto de cada aspirador (enviada pelo usuário). */
  private photos = new Map<string, number>();
  setPhoto(entityId: string, version: number | null) {
    if (version === null) this.photos.delete(entityId);
    else this.photos.set(entityId, version);
    const s = this.states.get(entityId);
    if (s) this.emit('state', this.dto(s));
  }

  setRegistryProvider(fn: () => Promise<Map<string, { deviceId: string | null }>>) {
    this.registryProvider = fn;
    this.lastFullRefresh = 0;
  }

  setHiddenProvider(fn: () => Promise<Set<string>>) {
    this.hiddenProvider = fn;
    this.lastFullRefresh = 0;
  }

  constructor(
    private readonly db: Db,
    private readonly ha: HomeAssistantRestClient,
    private readonly logs: ActionLogService,
    autoAuthorizeDomains: string,
    private readonly cacheMs = 5_000,
  ) {
    super();
    this.autoAuthorize = new Set(autoAuthorizeDomains.split(',').map((d) => d.trim()).filter(Boolean));
  }

  private isActor(source: string) {
    return source.startsWith('ai:') || source === 'voice';
  }

  /** Busca estados reais no HA e sincroniza a tabela de dispositivos (sem inventar entity_id). */
  async refresh(force = false): Promise<void> {
    if (!force && Date.now() - this.lastFullRefresh < this.cacheMs && this.states.size > 0) return;
    const [all, haHidden, registry] = await Promise.all([
      this.ha.getStates(),
      this.hiddenProvider().catch(() => new Set<string>()),
      this.registryProvider().catch(() => new Map<string, { deviceId: string | null }>()),
    ]);
    this.linkVacuumCompanions(all, registry);
    // Ignora entidades ocultas/desativadas no próprio HA (evita duplicatas do mesmo aparelho)
    const relevant = all.filter((s) => (SUPPORTED_DOMAINS as readonly string[]).includes(domainOf(s.entity_id)) && !haHidden.has(s.entity_id) && !this.companions.has(s.entity_id));
    const next = new Map(relevant.map((s) => [s.entity_id, s]));

    const rows = await this.db.device.findMany();
    const known = new Map(rows.map((r) => [r.entityId, r]));
    for (const s of relevant) {
      const name = (s.attributes.friendly_name as string | undefined) ?? s.entity_id;
      const domain = domainOf(s.entity_id);
      const existing = known.get(s.entity_id);
      if (!existing) {
        await this.db.device.create({
          data: {
            entityId: s.entity_id,
            domain,
            name,
            category: toDeviceDto(s, { aiAllowed: false, aliases: [], hidden: false }).category,
            aiAllowed: CONTROLLABLE_DOMAINS.has(domain) && this.autoAuthorize.has(domain),
          },
        });
      } else if (existing.name !== name) {
        await this.db.device.update({ where: { entityId: s.entity_id }, data: { name, lastSeen: new Date() } });
      }
    }
    const fresh = await this.db.device.findMany();
    this.meta = new Map(fresh.map((r) => [r.entityId, { aiAllowed: r.aiAllowed, hidden: r.hidden, aliases: safeJson<string[]>(r.aliases, []), customName: r.customName }]));
    this.states = next;
    this.lastFullRefresh = Date.now();
  }

  /** Liga ao aspirador as outras entidades do mesmo aparelho físico (registro de dispositivos do HA). */
  private linkVacuumCompanions(all: HaState[], registry: Map<string, { deviceId: string | null }>) {
    const vacuumByDevice = new Map<string, string>();
    for (const s of all) {
      const dev = registry.get(s.entity_id)?.deviceId;
      if (domainOf(s.entity_id) === 'vacuum' && dev) vacuumByDevice.set(dev, s.entity_id);
    }
    this.companions = new Map();
    this.companionStates = new Map();
    this.batteryOf = new Map();
    for (const s of all) {
      const dev = registry.get(s.entity_id)?.deviceId;
      const vacuum = dev ? vacuumByDevice.get(dev) : undefined;
      if (!vacuum || s.entity_id === vacuum) continue;
      this.companions.set(s.entity_id, vacuum);
      this.companionStates.set(s.entity_id, s);
      if (domainOf(s.entity_id) === 'sensor' && s.attributes.device_class === 'battery' && !this.batteryOf.has(vacuum)) this.batteryOf.set(vacuum, s.entity_id);
    }
  }

  private dto(state: HaState): DeviceDto {
    const meta = this.meta.get(state.entity_id) ?? { aiAllowed: false, aliases: [], hidden: false, customName: null };
    if (domainOf(state.entity_id) !== 'vacuum') return toDeviceDto(state, meta);
    return toDeviceDto(state, { ...meta, battery: this.vacuumBattery(state), extras: buildExtras(state.entity_id, this.companionsOf(state.entity_id)), photo: this.photos.get(state.entity_id) ?? null });
  }

  private companionsOf(vacuumId: string): HaState[] {
    const out: HaState[] = [];
    for (const [id, owner] of this.companions) if (owner === vacuumId) { const st = this.companionStates.get(id); if (st) out.push(st); }
    return out;
  }

  /**
   * Bateria do aspirador: integrações novas do HA publicam num sensor separado
   * (ex.: vacuum.robo_xiaomi → sensor.robo_xiaomi_battery). Procura pelo prefixo do id ou do nome.
   */
  private vacuumBattery(vacuum: HaState): number | null {
    // 1) Sensor de bateria do mesmo aparelho (registro do HA — ex.: Xiaomi Home)
    const linked = this.batteryOf.get(vacuum.entity_id);
    if (linked) {
      const v = Number(this.companionStates.get(linked)?.state);
      if (Number.isFinite(v)) return v;
    }
    // 2) Sem registro: procura pelo prefixo do id ou do nome
    const objectId = vacuum.entity_id.split('.')[1]!;
    const name = normalize((vacuum.attributes.friendly_name as string | undefined) ?? '');
    for (const s of this.states.values()) {
      if (domainOf(s.entity_id) !== 'sensor' || s.attributes.device_class !== 'battery') continue;
      const sid = s.entity_id.split('.')[1]!;
      const sname = normalize((s.attributes.friendly_name as string | undefined) ?? '');
      if (sid.startsWith(`${objectId}_`) || (name && sname.startsWith(`${name} `))) {
        const v = Number(s.state);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  }

  async list(opts: { includeHidden?: boolean } = {}): Promise<DeviceDto[]> {
    await this.refresh();
    return [...this.states.values()]
      .map((s) => this.dto(s))
      .filter((d) => opts.includeHidden || !d.hidden)
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'pt-BR'));
  }

  async get(entityId: string): Promise<DeviceDto> {
    if (!ENTITY_ID_RE.test(entityId)) throw badRequest('entity_id inválido.');
    await this.refresh();
    if (!this.states.has(entityId)) throw notFound(`Não encontrei o dispositivo ${entityId} no Home Assistant.`);
    const live = await this.ha.getState(entityId);
    this.states.set(entityId, live);
    return this.dto(live);
  }

  /** Aplica alterações vindas do WebSocket do HA e notifica os clientes. */
  handleStateChanged(evt: HaStateChangedEvent) {
    // Acessória de aspirador (ex.: bateria mudou): atualiza o cartão do robô
    const owner = this.companions.get(evt.entity_id);
    if (owner) {
      if (evt.new_state) this.companionStates.set(evt.entity_id, evt.new_state);
      const vacuum = this.states.get(owner);
      const parsed = evt.new_state ? parseCompanion(evt.new_state, owner.split('.')[1]!) : null;
      const noisy = domainOf(evt.entity_id) === 'event' || (parsed !== null && NOISY_COMPANIONS.has(parsed.name));
      if (vacuum && !noisy && evt.old_state?.state !== evt.new_state?.state) this.emit('state', this.dto(vacuum));
      return;
    }
    if (!(SUPPORTED_DOMAINS as readonly string[]).includes(domainOf(evt.entity_id))) return;
    if (!evt.new_state) {
      this.states.delete(evt.entity_id);
      this.emit('reload');
      return;
    }
    const isNew = !this.states.has(evt.entity_id);
    this.states.set(evt.entity_id, evt.new_state);
    if (isNew) {
      this.lastFullRefresh = 0; // força sincronizar a tabela na próxima listagem
      this.emit('reload');
    } else {
      this.emit('state', this.dto(evt.new_state));
    }
  }

  async update(entityId: string, patch: { aiAllowed?: boolean; aliases?: string[]; hidden?: boolean; name?: string | null }) {
    const current = await this.get(entityId);
    if (patch.name) {
      const clash = (await this.list({ includeHidden: true })).find((d) => d.entityId !== entityId && normalize(d.name) === normalize(patch.name!));
      if (clash) throw badRequest(`Já existe um dispositivo chamado “${clash.name}”. Use um nome diferente para a Luna não confundir.`);
    }
    if (patch.aiAllowed && !CONTROLLABLE_DOMAINS.has(domainOf(entityId))) {
      throw badRequest('Somente dispositivos controláveis podem ser autorizados para a IA. Sensores já podem ser consultados.');
    }
    await this.db.device.update({
      where: { entityId },
      data: {
        aiAllowed: patch.aiAllowed,
        hidden: patch.hidden,
        aliases: patch.aliases ? JSON.stringify(patch.aliases) : undefined,
        // string = renomeia; null ou igual ao nome do HA = volta ao original
        customName: patch.name === undefined ? undefined : patch.name && patch.name !== current.originalName ? patch.name : null,
      },
    });
    this.lastFullRefresh = 0;
    return this.get(entityId);
  }

  /** Validação central de autorização para qualquer ação. */
  private async authorize(entityId: string, actor: Actor): Promise<DeviceDto> {
    const device = await this.get(entityId);
    if (!device.controllable) throw forbidden(`${device.name} é somente leitura.`);
    if (this.isActor(actor.source) && !device.aiAllowed) {
      throw forbidden(`${device.name} não está autorizado para comandos da Luna. Autorize em "Minha casa".`);
    }
    if (!device.available) throw new AppError(409, `${device.name} está indisponível no momento.`, 'device_unavailable');
    return device;
  }

  private async execute(entityId: string, service: 'turn_on' | 'turn_off', data: Record<string, unknown>, actor: Actor, tool: string) {
    const domain = domainOf(entityId);
    // Aspirador: “ligar” = começar a limpar; “desligar” = voltar para a base
    if (domain === 'vacuum') return this.vacuumCommand(entityId, service === 'turn_on' ? 'start' : 'return_to_base', actor, undefined, tool);
    try {
      const before = await this.authorize(entityId, actor);
      await this.ha.callService(domain, service, { entity_id: entityId, ...data });
      // Lê o estado real após a execução para confirmar o resultado
      const after = await this.waitForState(entityId, service === 'turn_on');
      await this.logs.log({ userId: actor.userId, source: actor.source, tool, target: entityId, args: data, success: true, detail: `${before.state} → ${after.state}` });
      this.emit('state', after);
      return after;
    } catch (err) {
      await this.logs.log({ userId: actor.userId, source: actor.source, tool, target: entityId, args: data, success: false, detail: (err as Error).message });
      throw err;
    }
  }

  private async waitForState(entityId: string, expectOn: boolean): Promise<DeviceDto> {
    let dto = await this.get(entityId);
    for (let i = 0; i < 4 && dto.isOn !== expectOn; i++) {
      await new Promise((r) => setTimeout(r, 250));
      dto = await this.get(entityId);
    }
    return dto;
  }

  /**
   * Comandos do aspirador robô. Lista fechada de serviços do domínio vacuum do HA —
   * nada de send_command genérico (a IA não pode mandar comandos arbitrários).
   */
  async vacuumCommand(entityId: string, command: VacuumCommand, actor: Actor, fanSpeed?: string, tool = `vacuum_${command}`): Promise<DeviceDto> {
    if (domainOf(entityId) !== 'vacuum') throw badRequest('Este comando é só para aspiradores robôs.');
    const data: Record<string, unknown> = {};
    try {
      const before = await this.authorize(entityId, actor);
      const info = before.vacuum!;
      if (command === 'set_fan_speed') {
        if (!info.can.fanSpeed) throw badRequest(`${before.name} não permite ajustar a potência pela Luna.`);
        const wanted = info.fanSpeeds.find((f) => normalize(f) === normalize(fanSpeed ?? ''));
        if (!wanted) throw badRequest(`Potência inválida. Opções: ${info.fanSpeeds.join(', ')}.`);
        data.fan_speed = wanted;
      }
      if (command === 'locate' && !info.can.locate) throw badRequest(`${before.name} não tem a função de apitar para ser encontrado.`);
      // Xiaomi Home: localizar e potência vêm de entidades acessórias quando o aspirador não tem o recurso
      const feat = Number(this.states.get(entityId)?.attributes.supported_features ?? 0);
      const extra = (key: string) => info.extras?.controls.find((c) => c.key === key);
      if (command === 'locate' && !(feat & 512) && extra('locate')) return this.pressExtra(before, extra('locate')!.id, undefined, actor, tool);
      if (command === 'set_fan_speed' && !(feat & 32) && extra('suction')) return this.pressExtra(before, extra('suction')!.id, data.fan_speed as string, actor, tool);
      if (command === 'pause' && !info.can.pause) command = 'stop';
      if (command === 'return_to_base' && info.phase === 'docked') {
        await this.logs.log({ userId: actor.userId, source: actor.source, tool, target: entityId, args: {}, success: true, detail: 'já estava na base' });
        return before;
      }
      await this.ha.callService('vacuum', command, { entity_id: entityId, ...data });
      // Robôs (principalmente na nuvem) demoram alguns segundos para mudar de estado
      const expect: Partial<Record<VacuumCommand, string[]>> = { start: ['cleaning'], pause: ['paused', 'idle'], stop: ['idle', 'paused'], return_to_base: ['returning', 'docked'] };
      let after = await this.get(entityId);
      for (let i = 0; i < 12 && expect[command] && !expect[command]!.includes(after.vacuum?.phase ?? ''); i++) {
        await new Promise((r) => setTimeout(r, 350));
        after = await this.get(entityId);
      }
      await this.logs.log({ userId: actor.userId, source: actor.source, tool, target: entityId, args: data, success: true, detail: `${before.state} → ${after.state}` });
      this.emit('state', after);
      return after;
    } catch (err) {
      await this.logs.log({ userId: actor.userId, source: actor.source, tool, target: entityId, args: data, success: false, detail: (err as Error).message });
      throw err;
    }
  }

  /**
   * Controles extras do robô (lavar pano, sucção, não perturbe…). Só aceita os controles que a
   * própria Luna listou para este aspirador — nada de chamar serviço arbitrário do Home Assistant.
   */
  async vacuumExtra(entityId: string, controlId: string, value: string | boolean | undefined, actor: Actor): Promise<DeviceDto> {
    if (domainOf(entityId) !== 'vacuum') throw badRequest('Este comando é só para aspiradores robôs.');
    try {
      const before = await this.authorize(entityId, actor);
      return await this.pressExtra(before, controlId, value, actor, 'vacuum_extra');
    } catch (err) {
      await this.logs.log({ userId: actor.userId, source: actor.source, tool: 'vacuum_extra', target: entityId, args: { controlId, value }, success: false, detail: (err as Error).message });
      throw err;
    }
  }

  private async pressExtra(vacuum: DeviceDto, controlId: string, value: string | boolean | undefined, actor: Actor, tool: string): Promise<DeviceDto> {
    const control = vacuum.vacuum?.extras?.controls.find((c) => c.id === controlId);
    if (!control) throw badRequest('Opção não disponível para este robô.');
    const domain = domainOf(control.id);
    const raw = this.companionStates.get(control.id);
    if (control.kind === 'action') {
      await this.ha.callService('button', 'press', { entity_id: control.id });
    } else if (control.kind === 'choice') {
      const option = control.options?.find((o) => normalize(o.value) === normalize(String(value ?? '')) || normalize(o.label) === normalize(String(value ?? '')));
      if (!option) throw badRequest(`Opção inválida. Opções: ${(control.options ?? []).map((o) => o.label).join(', ')}.`);
      await this.ha.callService('select', 'select_option', { entity_id: control.id, option: option.value });
    } else {
      if (typeof value !== 'boolean') throw badRequest('Informe ligado ou desligado.');
      if (domain === 'select') {
        const opts = (raw?.attributes.options as string[] | undefined) ?? ['Open', 'Close'];
        const option = opts.find((o) => (value ? /^open$/i : /^close$/i).test(o))!;
        await this.ha.callService('select', 'select_option', { entity_id: control.id, option });
      } else {
        await this.ha.callService('switch', value ? 'turn_on' : 'turn_off', { entity_id: control.id });
      }
    }
    // Lê de volta a entidade acessória para devolver o estado novo
    try {
      this.companionStates.set(control.id, await this.ha.getState(control.id));
    } catch {
      /* o tempo real atualiza depois */
    }
    await this.logs.log({ userId: actor.userId, source: actor.source, tool, target: vacuum.entityId, args: { control: control.key, value }, success: true, detail: control.label });
    const after = this.dto(this.states.get(vacuum.entityId)!);
    this.emit('state', after);
    return after;
  }

  turnOn(entityId: string, actor: Actor) {
    return this.execute(entityId, 'turn_on', {}, actor, 'turn_on');
  }

  turnOff(entityId: string, actor: Actor) {
    return this.execute(entityId, 'turn_off', {}, actor, 'turn_off');
  }

  async setBrightness(entityId: string, pct: number, actor: Actor) {
    if (domainOf(entityId) !== 'light') throw badRequest('Brilho só pode ser ajustado em lâmpadas.');
    const device = await this.get(entityId);
    if (!device.supportsBrightness) throw badRequest(`${device.name} não suporta ajuste de brilho.`);
    const value = Math.max(0, Math.min(100, Math.round(pct)));
    if (value === 0) return this.execute(entityId, 'turn_off', {}, actor, 'set_brightness');
    return this.execute(entityId, 'turn_on', { brightness_pct: value }, actor, 'set_brightness');
  }

  /** Executa em lote somente sobre entidades autorizadas de um domínio. */
  async bulk(domain: string, service: 'turn_on' | 'turn_off', actor: Actor) {
    const devices = (await this.list({ includeHidden: true })).filter(
      (d) => d.domain === domain && d.controllable && d.available && (!this.isActor(actor.source) || d.aiAllowed),
    );
    const results: { device: DeviceDto; ok: boolean; error?: string }[] = [];
    for (const d of devices) {
      try {
        const after = await this.execute(d.entityId, service, {}, actor, `${service}_all_${domain}`);
        results.push({ device: after, ok: true });
      } catch (err) {
        results.push({ device: d, ok: false, error: (err as Error).message });
      }
    }
    return results;
  }

  /**
   * Encontra dispositivos pelo nome/apelido. Retorna candidatos ordenados por relevância.
   * Nunca cria entity_id: só considera entidades reais retornadas pelo HA.
   */
  async findByName(query: string, opts: { domain?: string; controllableOnly?: boolean } = {}): Promise<DeviceMatch[]> {
    const devices = await this.list({ includeHidden: false });
    const qNorm = normalize(query);
    const qTokens = significantTokens(query);
    const matches: DeviceMatch[] = [];
    for (const d of devices) {
      if (opts.domain && d.domain !== opts.domain) continue;
      if (opts.controllableOnly && !d.controllable) continue;
      if (d.entityId === query) {
        matches.push({ device: d, score: 100 });
        continue;
      }
      // Pesos: nome dado na Luna > apelidos/nome no HA > identificador técnico (entity_id)
      const names: [string, number][] = [
        [d.name, d.renamed ? 3 : 0],
        [d.originalName, 0],
        ...d.aliases.map((a) => [a, 1] as [string, number]),
        [d.entityId.split('.')[1]!.replace(/_/g, ' '), -15],
      ];
      let best = 0;
      for (const [n, bonus] of names) {
        const nNorm = normalize(n);
        if (!nNorm) continue;
        let score = 0;
        if (nNorm === qNorm) score = 90;
        const nTokens = significantTokens(n);
        if (qTokens.length && nTokens.length) {
          const hits = qTokens.filter((t) => nTokens.includes(t)).length;
          if (hits === qTokens.length && hits === nTokens.length) score = Math.max(score, 85);
          else if (hits === qTokens.length) score = Math.max(score, 60 + hits * 5);
          else if (hits > 0 && nTokens.every((t) => qTokens.includes(t))) score = Math.max(score, 55 + hits * 5);
          else if (hits > 0) score = Math.max(score, 20 + hits * 5);
        }
        if (score > 0) best = Math.max(best, score + bonus);
      }
      if (best >= 50) matches.push({ device: d, score: best });
    }
    matches.sort((a, b) => b.score - a.score);
    if (matches.length === 0) return [];
    const top = matches[0]!.score;
    return matches.filter((m) => m.score === top);
  }
}
