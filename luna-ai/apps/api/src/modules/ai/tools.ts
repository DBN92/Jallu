import type { ActionResult, Coordinates, DeviceDto } from '@luna/shared';
import { AppError } from '../../lib/errors';
import type { DevicesService, Actor } from '../devices/devices.service';
import type { WeatherService } from '../weather/weather.service';
import { WeatherService as WS } from '../weather/weather.service';
import type { MemoryService } from '../memory/memory.service';
import type { SettingsService } from '../settings/settings.service';
import type { AutomationsService } from '../automations/automations.service';
import type { ToolDefinition } from './types';

export interface ToolContext {
  userId: string;
  source: Actor['source'];
  /** Coordenadas efêmeras enviadas pelo navegador (não persistidas). */
  location?: Coordinates;
  /** Provedor em nuvem? Se sim, reduzimos dados pessoais nos resultados. */
  cloud: boolean;
}

export interface ToolOutcome {
  output: Record<string, unknown>;
  action?: ActionResult;
}

const CATEGORY_ENUM = ['lighting', 'switches', 'outlets', 'sensors', 'climate', 'other'];

/** Lista FECHADA de funções que a IA pode chamar. Não existe ferramenta genérica de serviço/shell. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_devices',
    description: 'Lista dispositivos reais da casa (Home Assistant) com estado atual. Use para responder quais luzes estão ligadas, etc.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: CATEGORY_ENUM, description: 'Filtra por categoria (lighting = luzes)' },
        only_on: { type: 'boolean', description: 'Somente dispositivos ligados' },
      },
    },
  },
  {
    name: 'get_device_state',
    description: 'Consulta o estado de um dispositivo ou sensor pelo nome falado pelo usuário (ex.: "luz da sala", "temperatura do quarto").',
    parameters: { type: 'object', properties: { device: { type: 'string', description: 'Nome do dispositivo como o usuário disse' } }, required: ['device'] },
  },
  {
    name: 'control_device',
    description: 'Liga ou desliga UM dispositivo autorizado pelo nome. Se houver ambiguidade, o resultado traz opções e você deve perguntar ao usuário.',
    parameters: {
      type: 'object',
      properties: {
        device: { type: 'string', description: 'Nome do dispositivo como o usuário disse (ex.: "luz da sala")' },
        action: { type: 'string', enum: ['turn_on', 'turn_off'] },
      },
      required: ['device', 'action'],
    },
  },
  {
    name: 'set_brightness',
    description: 'Ajusta o brilho (0 a 100%) de uma lâmpada autorizada.',
    parameters: {
      type: 'object',
      properties: { device: { type: 'string' }, brightness: { type: 'integer', minimum: 0, maximum: 100 } },
      required: ['device', 'brightness'],
    },
  },
  {
    name: 'control_all_lights',
    description: 'Liga ou desliga TODAS as luzes autorizadas da casa.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['turn_on', 'turn_off'] } }, required: ['action'] },
  },
  {
    name: 'get_weather',
    description: 'Previsão do tempo para a localização do usuário (GPS autorizado ou casa). Use para chuva, temperatura, guarda-chuva.',
    parameters: { type: 'object', properties: { period: { type: 'string', enum: ['now', 'today', 'tomorrow', 'week'] } } },
  },
  {
    name: 'get_datetime',
    description: 'Retorna data, dia da semana e horário atuais.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'remember',
    description: 'Salva uma memória SOMENTE quando o usuário pedir explicitamente para lembrar algo (ex.: "lembre que eu gosto de...").',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Fato em terceira pessoa, ex.: "O usuário prefere luz quente à noite"' },
        type: { type: 'string', enum: ['preference', 'fact', 'home'] },
      },
      required: ['content'],
    },
  },
  {
    name: 'forget',
    description: 'Apaga memórias que contenham o trecho informado, quando o usuário pedir para esquecer algo.',
    parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
  },
  {
    name: 'create_automation_draft',
    description:
      'Cria um RASCUNHO de automação (não ativa). O usuário precisa revisar e confirmar na tela Automações. Gatilhos: horário fixo, pôr do sol, nascer do sol, sair/chegar em casa.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome curto da automação' },
        trigger: { type: 'string', enum: ['time', 'sunset', 'sunrise', 'leave_home', 'arrive_home'] },
        time: { type: 'string', description: 'HH:MM, obrigatório quando trigger=time' },
        offset_minutes: { type: 'integer', description: 'Deslocamento para sunset/sunrise' },
        action: { type: 'string', enum: ['turn_on', 'turn_off'] },
        devices: { type: 'array', items: { type: 'string' }, description: 'Nomes dos dispositivos, ou ["todas as luzes"]' },
      },
      required: ['name', 'trigger', 'action', 'devices'],
    },
  },
];

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function deviceSummary(d: DeviceDto) {
  return {
    entity_id: d.entityId,
    nome: d.name,
    estado: d.state,
    ligado: d.isOn,
    disponivel: d.available,
    brilho_pct: d.supportsBrightness ? d.brightness : undefined,
    unidade: d.unit ?? undefined,
    autorizado_para_luna: d.controllable ? d.aiAllowed : undefined,
  };
}

/** Executor central: valida argumentos, resolve nomes em entidades reais e aplica autorização. */
export class ToolExecutor {
  constructor(
    private readonly devices: DevicesService,
    private readonly weather: WeatherService,
    private readonly memory: MemoryService,
    private readonly settings: SettingsService,
    private readonly automations: AutomationsService,
    private readonly timezone: string,
  ) {}

  private actor(ctx: ToolContext): Actor {
    return { source: ctx.source, userId: ctx.userId };
  }

  /** Resolve um nome em exatamente um dispositivo, ou retorna ambiguidade/erro para a IA. */
  async resolve(name: string, opts: { controllableOnly?: boolean; domain?: string } = {}) {
    const exact = /^[a-z_]+\.[a-z0-9_]+$/.test(name) ? name : null;
    const matches = await this.devices.findByName(exact ?? name, opts);
    if (matches.length === 0) return { status: 'not_found' as const };
    if (matches.length > 1) return { status: 'ambiguous' as const, options: matches.map((m) => m.device) };
    return { status: 'ok' as const, device: matches[0]!.device };
  }

  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    try {
      return await this.run(name, args, ctx);
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'Falha inesperada ao executar a ação.';
      return { output: { ok: false, erro: message }, action: { tool: name, ok: false, summary: message } };
    }
  }

  private async run(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
    switch (name) {
      case 'list_devices': {
        let list = await this.devices.list();
        const category = str(args.category);
        if (CATEGORY_ENUM.includes(category)) list = list.filter((d) => d.category === category);
        if (args.only_on === true) list = list.filter((d) => d.isOn === true);
        return { output: { ok: true, total: list.length, dispositivos: list.slice(0, 60).map(deviceSummary) } };
      }
      case 'get_device_state': {
        const r = await this.resolve(str(args.device));
        if (r.status === 'not_found') return { output: { ok: false, erro: `Não encontrei "${str(args.device)}" na casa.` } };
        if (r.status === 'ambiguous') return { output: { ok: false, ambiguo: true, opcoes: r.options.map((d) => d.name) } };
        return { output: { ok: true, dispositivo: deviceSummary(await this.devices.get(r.device.entityId)) } };
      }
      case 'control_device': {
        const action = str(args.action);
        if (action !== 'turn_on' && action !== 'turn_off') return { output: { ok: false, erro: 'Ação inválida.' } };
        const r = await this.resolve(str(args.device), { controllableOnly: true });
        if (r.status === 'not_found') return { output: { ok: false, erro: `Não encontrei "${str(args.device)}" entre os dispositivos controláveis.` } };
        if (r.status === 'ambiguous') {
          return { output: { ok: false, ambiguo: true, mensagem: 'Pergunte ao usuário qual destes ele quer controlar.', opcoes: r.options.map((d) => d.name) } };
        }
        const after = action === 'turn_on' ? await this.devices.turnOn(r.device.entityId, this.actor(ctx)) : await this.devices.turnOff(r.device.entityId, this.actor(ctx));
        const summary = `${after.name}: ${after.isOn ? 'ligado' : 'desligado'}`;
        return { output: { ok: true, dispositivo: deviceSummary(after) }, action: { tool: name, ok: true, summary, entityIds: [after.entityId] } };
      }
      case 'set_brightness': {
        const pct = Number(args.brightness);
        if (!Number.isFinite(pct)) return { output: { ok: false, erro: 'Brilho inválido.' } };
        const r = await this.resolve(str(args.device), { controllableOnly: true, domain: 'light' });
        if (r.status === 'not_found') return { output: { ok: false, erro: `Não encontrei a lâmpada "${str(args.device)}".` } };
        if (r.status === 'ambiguous') return { output: { ok: false, ambiguo: true, opcoes: r.options.map((d) => d.name) } };
        const after = await this.devices.setBrightness(r.device.entityId, pct, this.actor(ctx));
        return { output: { ok: true, dispositivo: deviceSummary(after) }, action: { tool: name, ok: true, summary: `${after.name}: brilho ${after.brightness ?? 0}%`, entityIds: [after.entityId] } };
      }
      case 'control_all_lights': {
        const action = str(args.action) === 'turn_on' ? 'turn_on' : 'turn_off';
        const results = await this.devices.bulk('light', action, this.actor(ctx));
        const ok = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);
        const summary = results.length === 0 ? 'Nenhuma luz autorizada encontrada' : `${ok.length} luz(es) ${action === 'turn_on' ? 'ligada(s)' : 'desligada(s)'}${failed.length ? `, ${failed.length} falha(s)` : ''}`;
        return {
          output: { ok: failed.length === 0 && results.length > 0, alteradas: ok.map((r) => r.device.name), falhas: failed.map((r) => ({ nome: r.device.name, erro: r.error })) },
          action: { tool: name, ok: failed.length === 0 && results.length > 0, summary, entityIds: ok.map((r) => r.device.entityId) },
        };
      }
      case 'get_weather': {
        const period = (['now', 'today', 'tomorrow', 'week'].includes(str(args.period)) ? str(args.period) : 'today') as 'now' | 'today' | 'tomorrow' | 'week';
        let coords = ctx.location ?? null;
        let label: string | null = coords ? 'sua localização atual' : null;
        if (!coords) {
          const s = await this.settings.get(ctx.userId);
          if (s.homeLocation) {
            coords = { latitude: s.homeLocation.latitude, longitude: s.homeLocation.longitude };
            label = ctx.cloud ? 'casa' : s.homeLocation.name;
          }
        }
        if (!coords) {
          return { output: { ok: false, erro: 'Localização indisponível. Peça ao usuário para permitir o GPS no app ou definir a localização de casa em Configurações.' } };
        }
        const w = await this.weather.forecast(coords.latitude, coords.longitude, label);
        return { output: { ok: true, ...WS.summarize(w, period) } };
      }
      case 'get_datetime': {
        const now = new Date();
        const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: this.timezone, ...o }).format(now);
        return { output: { ok: true, data: fmt({ dateStyle: 'full' }), hora: fmt({ hour: '2-digit', minute: '2-digit' }), fuso: this.timezone } };
      }
      case 'remember': {
        const content = str(args.content);
        if (content.length < 3) return { output: { ok: false, erro: 'Conteúdo vazio.' } };
        const type = (['preference', 'fact', 'home'].includes(str(args.type)) ? str(args.type) : 'fact') as 'preference' | 'fact' | 'home';
        const m = await this.memory.add(ctx.userId, { type, content, source: 'conversation' });
        return { output: { ok: true, memoria: m.content }, action: { tool: name, ok: true, summary: `Memória salva: ${m.content}` } };
      }
      case 'forget': {
        const n = await this.memory.forgetMatching(ctx.userId, str(args.content));
        return { output: { ok: true, removidas: n }, action: { tool: name, ok: n > 0, summary: n ? `${n} memória(s) apagada(s)` : 'Nenhuma memória correspondente' } };
      }
      case 'create_automation_draft': {
        const names = Array.isArray(args.devices) ? args.devices.map(str).filter(Boolean) : [];
        const allLights = names.some((n) => /todas?\s+as\s+luze?s|todas as l[aâ]mpadas|^luzes$/i.test(n));
        let target: 'all_lights' | string[] = 'all_lights';
        if (!allLights) {
          const ids: string[] = [];
          for (const n of names) {
            const r = await this.resolve(n, { controllableOnly: true });
            if (r.status === 'not_found') return { output: { ok: false, erro: `Não encontrei "${n}".` } };
            if (r.status === 'ambiguous') return { output: { ok: false, ambiguo: true, opcoes: r.options.map((d) => d.name) } };
            ids.push(r.device.entityId);
          }
          if (!ids.length) return { output: { ok: false, erro: 'Informe quais dispositivos a automação deve controlar.' } };
          target = ids;
        }
        const triggerType = str(args.trigger);
        let trigger: Record<string, unknown>;
        if (triggerType === 'time') trigger = { type: 'time', at: str(args.time).padStart(5, '0') };
        else if (triggerType === 'sunset' || triggerType === 'sunrise') trigger = { type: triggerType, offsetMinutes: Number(args.offset_minutes ?? 0) || 0 };
        else if (triggerType === 'leave_home' || triggerType === 'arrive_home') {
          const persons = await this.automations.persons();
          if (persons.length !== 1) {
            return { output: { ok: false, erro: persons.length ? 'Há mais de uma pessoa no Home Assistant; crie esta automação pela tela Automações escolhendo a pessoa.' : 'Não há entidades person no Home Assistant (configure o app Companion).' } };
          }
          trigger = { type: triggerType, personEntityId: persons[0]!.entityId };
        } else return { output: { ok: false, erro: 'Gatilho não suportado.' } };
        const rule = await this.automations.createDraft({ name: str(args.name) || 'Automação da Luna', trigger, action: { service: str(args.action), target } }, ctx.userId);
        return {
          output: { ok: true, rascunho: rule.description, status: 'rascunho — aguardando confirmação do usuário na tela Automações' },
          action: { tool: name, ok: true, summary: `Rascunho criado: ${rule.description} Confirme em Automações.` },
        };
      }
      default:
        return { output: { ok: false, erro: `Ferramenta desconhecida: ${name}` } };
    }
  }
}
