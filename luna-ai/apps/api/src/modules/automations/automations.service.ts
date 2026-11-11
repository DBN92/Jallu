import { automationDraftSchema, type AutomationDraft, type AutomationRuleDto, type AutomationStatus } from '@luna/shared';
import type { Db } from '../../lib/db';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { safeJson } from '../../lib/text';
import type { HomeAssistantRestClient } from '../../integrations/home-assistant/rest-client';
import type { DevicesService } from '../devices/devices.service';
import type { ActionLogService } from '../devices/action-log.service';
import { domainOf } from '../devices/categorize';

const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
const offsetStr = (min: number) => `${min < 0 ? '-' : ''}${pad(Math.trunc(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}:00`;

export class AutomationsService {
  constructor(
    private readonly db: Db,
    private readonly ha: HomeAssistantRestClient,
    private readonly devices: DevicesService,
    private readonly logs: ActionLogService,
  ) {}

  /** Texto legível da regra. */
  describe(draft: AutomationDraft, targetNames: string[]): string {
    const t = draft.trigger;
    const when =
      t.type === 'time'
        ? `Todos os dias às ${t.at}`
        : t.type === 'sunset' || t.type === 'sunrise'
          ? `${t.type === 'sunset' ? 'Ao anoitecer (pôr do sol)' : 'Ao amanhecer (nascer do sol)'}${t.offsetMinutes ? ` ${t.offsetMinutes > 0 ? '+' : ''}${t.offsetMinutes} min` : ''}`
          : t.type === 'leave_home'
            ? `Quando ${t.personEntityId} sair de casa`
            : `Quando ${t.personEntityId} chegar em casa`;
    const verb = draft.action.service === 'turn_on' ? 'ligar' : 'desligar';
    return `${when}: ${verb} ${targetNames.join(', ')}.`;
  }

  /** Resolve e valida os alvos: somente entidades reais, controláveis e autorizadas. */
  private async resolveTargets(draft: AutomationDraft) {
    const all = await this.devices.list({ includeHidden: true });
    let targets;
    if (draft.action.target === 'all_lights') {
      targets = all.filter((d) => d.domain === 'light' && d.aiAllowed);
      if (!targets.length) throw badRequest('Não há luzes autorizadas para esta automação.');
    } else {
      targets = draft.action.target.map((id) => {
        const d = all.find((x) => x.entityId === id);
        if (!d) throw badRequest(`O dispositivo ${id} não existe no Home Assistant.`);
        if (!d.controllable) throw badRequest(`${d.name} não pode ser ligado/desligado.`);
        if (!d.aiAllowed) throw badRequest(`${d.name} não está autorizado. Autorize em "Minha casa" antes de usá-lo em automações.`);
        return d;
      });
    }
    return targets;
  }

  private async validatePerson(draft: AutomationDraft) {
    const t = draft.trigger;
    if (t.type !== 'leave_home' && t.type !== 'arrive_home') return;
    const states = await this.ha.getStates();
    if (!states.some((s) => s.entity_id === t.personEntityId)) {
      throw badRequest(`A pessoa ${t.personEntityId} não existe no Home Assistant. Configure o app Companion/zonas no HA.`);
    }
  }

  buildHaConfig(id: string, draft: AutomationDraft, entityIds: string[], description: string) {
    const t = draft.trigger;
    const trigger =
      t.type === 'time'
        ? { platform: 'time', at: `${t.at}:00` }
        : t.type === 'sunset' || t.type === 'sunrise'
          ? { platform: 'sun', event: t.type, offset: offsetStr(t.offsetMinutes) }
          : t.type === 'leave_home'
            ? { platform: 'state', entity_id: t.personEntityId, from: 'home' }
            : { platform: 'state', entity_id: t.personEntityId, to: 'home' };
    const byDomain = new Map<string, string[]>();
    for (const e of entityIds) byDomain.set(domainOf(e), [...(byDomain.get(domainOf(e)) ?? []), e]);
    return {
      id,
      alias: `Luna: ${draft.name}`,
      description: `${description} (criada pela Luna)`,
      mode: 'single',
      trigger: [trigger],
      condition: [],
      action: [...byDomain.entries()].map(([domain, ids]) => ({ service: `${domain}.${draft.action.service}`, target: { entity_id: ids } })),
    };
  }

  /** Cria um RASCUNHO. Nada é enviado ao Home Assistant até a confirmação. */
  async createDraft(input: unknown, userId: string | null) {
    const draft = automationDraftSchema.parse(input);
    const targets = await this.resolveTargets(draft);
    await this.validatePerson(draft);
    const description = this.describe(draft, targets.map((t) => t.name));
    const row = await this.db.automationRule.create({
      data: {
        userId,
        name: draft.name,
        description,
        definition: JSON.stringify(draft),
        haConfig: '{}',
        status: 'draft',
      },
    });
    const haId = `luna_${row.id}`;
    const haConfig = this.buildHaConfig(haId, draft, targets.map((t) => t.entityId), description);
    await this.db.automationRule.update({ where: { id: row.id }, data: { haConfig: JSON.stringify(haConfig) } });
    return this.get(row.id);
  }

  private async findHaEntity(haId: string) {
    const states = await this.ha.getStates();
    return states.find((s) => s.entity_id.startsWith('automation.') && s.attributes.id === haId) ?? null;
  }

  /** Envia ao HA e confirma que a automação realmente existe e está habilitada. */
  async activate(id: string, userId: string | null) {
    const rule = await this.db.automationRule.findUnique({ where: { id } });
    if (!rule) throw notFound('Automação não encontrada.');
    const draft = automationDraftSchema.parse(JSON.parse(rule.definition));
    // Revalida os alvos no momento da ativação (autorização pode ter mudado)
    const targets = await this.resolveTargets(draft);
    await this.validatePerson(draft);
    const haId = rule.haAutomationId ?? `luna_${rule.id}`;
    const config = this.buildHaConfig(haId, draft, targets.map((t) => t.entityId), rule.description);
    try {
      await this.ha.saveAutomationConfig(haId, config);
    } catch (err) {
      const msg = (err as Error).message;
      await this.db.automationRule.update({ where: { id }, data: { status: 'error', lastError: msg } });
      await this.logs.log({ userId, source: 'ui', tool: 'automation_activate', target: haId, success: false, detail: msg });
      throw err;
    }
    let entity = null;
    for (let i = 0; i < 10 && !entity; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 300 : 700));
      entity = await this.findHaEntity(haId).catch(() => null);
    }
    const status: AutomationStatus = entity ? (entity.state === 'on' ? 'active' : 'disabled') : 'error';
    const lastError = entity ? null : 'O Home Assistant aceitou a configuração, mas a automação não apareceu. Verifique se automations.yaml está incluído em configuration.yaml.';
    await this.db.automationRule.update({
      where: { id },
      data: { status, haAutomationId: haId, haEntityId: entity?.entity_id ?? null, haConfig: JSON.stringify(config), lastError },
    });
    await this.logs.log({ userId, source: 'ui', tool: 'automation_activate', target: haId, success: Boolean(entity), detail: lastError ?? entity?.entity_id });
    return this.get(id);
  }

  async setEnabled(id: string, enabled: boolean, userId: string | null) {
    const rule = await this.db.automationRule.findUnique({ where: { id } });
    if (!rule?.haEntityId) throw badRequest('Esta automação ainda não foi criada no Home Assistant.');
    await this.ha.callService('automation', enabled ? 'turn_on' : 'turn_off', { entity_id: rule.haEntityId });
    await this.logs.log({ userId, source: 'ui', tool: enabled ? 'automation_enable' : 'automation_disable', target: rule.haEntityId, success: true });
    return this.get(id);
  }

  async remove(id: string, userId: string | null) {
    const rule = await this.db.automationRule.findUnique({ where: { id } });
    if (!rule) throw notFound('Automação não encontrada.');
    if (rule.haAutomationId && rule.status !== 'draft') {
      try {
        await this.ha.deleteAutomationConfig(rule.haAutomationId);
      } catch (err) {
        if (!(err instanceof AppError && err.statusCode === 404)) throw err;
      }
    }
    await this.db.automationRule.delete({ where: { id } });
    await this.logs.log({ userId, source: 'ui', tool: 'automation_delete', target: rule.haAutomationId, success: true });
  }

  async get(id: string): Promise<AutomationRuleDto> {
    const [dto] = await this.list(id);
    if (!dto) throw notFound('Automação não encontrada.');
    return dto;
  }

  /** Lista regras com o estado REAL lido do Home Assistant. */
  async list(onlyId?: string): Promise<AutomationRuleDto[]> {
    const rows = await this.db.automationRule.findMany({ where: onlyId ? { id: onlyId } : undefined, orderBy: { createdAt: 'desc' } });
    let states: Map<string, string> | null = null;
    if (rows.some((r) => r.haAutomationId && r.status !== 'draft')) {
      try {
        const all = await this.ha.getStates();
        states = new Map(all.filter((s) => s.entity_id.startsWith('automation.')).map((s) => [String(s.attributes.id ?? ''), `${s.entity_id}|${s.state}`]));
      } catch {
        states = null;
      }
    }
    const out: AutomationRuleDto[] = [];
    for (const r of rows) {
      let status = r.status as AutomationStatus;
      let haState: string | null = null;
      let haEntityId = r.haEntityId;
      if (states && r.haAutomationId && status !== 'draft') {
        const found = states.get(r.haAutomationId);
        if (found) {
          const [eid, st] = found.split('|');
          haEntityId = eid ?? null;
          haState = st ?? null;
          status = st === 'on' ? 'active' : 'disabled';
        } else {
          status = 'error';
        }
        if (status !== r.status || haEntityId !== r.haEntityId) {
          await this.db.automationRule.update({ where: { id: r.id }, data: { status, haEntityId } });
        }
      }
      out.push({
        id: r.id,
        name: r.name,
        description: r.description,
        status,
        haAutomationId: r.haAutomationId,
        haEntityId,
        haState,
        definition: safeJson(r.definition, {}),
        lastError: status === 'error' ? (r.lastError ?? 'Não encontrada no Home Assistant.') : null,
        createdAt: r.createdAt.toISOString(),
      });
    }
    return out;
  }

  async persons() {
    const states = await this.ha.getStates();
    return states.filter((s) => s.entity_id.startsWith('person.')).map((s) => ({ entityId: s.entity_id, name: String(s.attributes.friendly_name ?? s.entity_id), state: s.state }));
  }
}
