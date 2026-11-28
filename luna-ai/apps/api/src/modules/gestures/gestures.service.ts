import { GESTURES, GESTURE_LABELS, type GestureName, type GestureRuleDto } from '@luna/shared';
import type { Db } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import type { DevicesService } from '../devices/devices.service';

/** Intervalo mínimo entre dois disparos da mesma regra (evita repetir com a mão parada). */
export const GESTURE_COOLDOWN_MS = 5000;

type Row = { id: string; gesture: string; source: string; action: string; target: string; enabled: boolean };

const toDto = (r: Row): GestureRuleDto => ({
  id: r.id,
  gesture: r.gesture as GestureName,
  source: r.source,
  action: r.action as GestureRuleDto['action'],
  target: r.target,
  enabled: r.enabled,
});

/**
 * Comandos por gesto de mão. O reconhecimento roda no aparelho (navegador, com IA de visão local);
 * o servidor guarda as regras, confere qual regra vale para o gesto/câmera e executa a ação
 * com as mesmas validações e registro de qualquer outro comando.
 */
export class GesturesService {
  private lastFired = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly devices: DevicesService,
  ) {}

  async list(): Promise<GestureRuleDto[]> {
    return (await this.db.gestureRule.findMany({ orderBy: { createdAt: 'asc' } })).map(toDto);
  }

  private async validate(input: Omit<GestureRuleDto, 'id' | 'enabled'>) {
    if (!(GESTURES as readonly string[]).includes(input.gesture)) throw badRequest('Gesto inválido.');
    if (input.source !== 'device' && !/^camera\.[a-z0-9_]+$/.test(input.source)) throw badRequest('Câmera inválida.');
    if (input.target !== 'all_lights') {
      const d = await this.devices.get(input.target).catch(() => null);
      if (!d) throw badRequest('Aparelho não encontrado no Home Assistant.');
      if (!d.controllable) throw badRequest(`${d.name} não pode ser ligado/desligado.`);
    }
  }

  async create(input: Omit<GestureRuleDto, 'id' | 'enabled'> & { enabled?: boolean }) {
    await this.validate(input);
    return toDto(await this.db.gestureRule.create({ data: { gesture: input.gesture, source: input.source, action: input.action, target: input.target, enabled: input.enabled ?? true } }));
  }

  async update(id: string, patch: Partial<Omit<GestureRuleDto, 'id'>>) {
    const cur = await this.db.gestureRule.findUnique({ where: { id } });
    if (!cur) throw notFound('Regra não encontrada.');
    const next = { ...toDto(cur), ...patch };
    await this.validate(next);
    return toDto(await this.db.gestureRule.update({ where: { id }, data: { gesture: next.gesture, source: next.source, action: next.action, target: next.target, enabled: next.enabled } }));
  }

  async remove(id: string) {
    const r = await this.db.gestureRule.deleteMany({ where: { id } });
    if (!r.count) throw notFound('Regra não encontrada.');
    return { ok: true };
  }

  /** Câmeras que têm regras (o aparelho que analisa só olha estas). */
  async sources(): Promise<string[]> {
    return [...new Set((await this.db.gestureRule.findMany({ where: { enabled: true }, select: { source: true } })).map((r) => r.source))];
  }

  /**
   * Um aparelho reconheceu um gesto: executa as regras que combinam (gesto + câmera).
   * Cada regra tem um intervalo mínimo de 5 s entre disparos.
   */
  async fire(gesture: string, source: string, userId: string) {
    if (!(GESTURES as readonly string[]).includes(gesture)) throw badRequest('Gesto inválido.');
    const rules = await this.db.gestureRule.findMany({ where: { gesture, source, enabled: true } });
    const label = GESTURE_LABELS[gesture as GestureName];
    const results: { ruleId: string; ok: boolean; summary: string }[] = [];
    const now = Date.now();
    const actor = { source: 'gesture' as const, userId };
    for (const r of rules) {
      if (now - (this.lastFired.get(r.id) ?? 0) < GESTURE_COOLDOWN_MS) continue;
      this.lastFired.set(r.id, now);
      try {
        if (r.target === 'all_lights') {
          const service = r.action === 'turn_off' ? 'turn_off' : 'turn_on';
          const done = await this.devices.bulk('light', service, actor);
          results.push({ ruleId: r.id, ok: true, summary: `${service === 'turn_on' ? 'Luzes acesas' : 'Luzes apagadas'} (${done.filter((d) => d.ok).length})` });
          continue;
        }
        const d = await this.devices.get(r.target);
        const turnOn = r.action === 'turn_on' || (r.action === 'toggle' && !d.isOn);
        const after = turnOn ? await this.devices.turnOn(r.target, actor) : await this.devices.turnOff(r.target, actor);
        results.push({ ruleId: r.id, ok: true, summary: `${after.name} ${after.isOn ? 'ligada' : 'desligada'}` });
      } catch (err) {
        results.push({ ruleId: r.id, ok: false, summary: (err as Error).message });
      }
    }
    return { gesture, emoji: label.emoji, results };
  }
}
