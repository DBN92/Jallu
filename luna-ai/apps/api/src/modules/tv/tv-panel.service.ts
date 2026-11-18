import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeviceDto, TvPanelDto, TvSceneDto, TvSceneStep } from '@luna/shared';
import type { Db } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import { normalize } from '../../lib/text';
import type { Actor, DevicesService } from '../devices/devices.service';

interface Saved {
  scenes?: TvSceneDto[] | null;
  favorites?: string[] | null;
}

const FAV_MAX = 6;
const FAV_DAYS = 30;
const USE_TOOLS = ['turn_on', 'turn_off', 'set_brightness', 'set_color'];

const isLight = (d: DeviceDto) => d.category === 'lighting' && d.controllable && !d.hidden;
const isToggle = (d: DeviceDto) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors' && d.domain !== 'vacuum';

/**
 * Painel da TV (Fire TV Stick): cenas rápidas e as luzes do Início. Tudo é calculado sobre as entidades
 * reais do Home Assistant (nada de entity_id inventado); o que a pessoa muda nos Ajustes fica em tv-panel.json.
 */
export class TvPanelService {
  private file: string;

  constructor(
    private readonly db: Db,
    private readonly devices: DevicesService,
    dataDir: string,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'tv-panel.json');
  }

  private read(): Saved {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Saved;
    } catch {
      return {};
    }
  }

  private write(s: Saved) {
    writeFileSync(this.file, JSON.stringify(s, null, 2), { mode: 0o600 });
  }

  /** Cenas padrão: apagar/acender tudo, boa noite e cinema (sala apagada, luminária da sala em 20%). */
  defaultScenes(list: DeviceDto[]): TvSceneDto[] {
    const lights = list.filter(isLight);
    const sala = lights.filter((d) => normalize(d.name).includes('sala'));
    const lamp = sala.find((d) => normalize(d.name).includes('lumin')) ?? lights.find((d) => normalize(d.name).includes('lumin'));
    const cinema: TvSceneStep[] = [{ target: 'room:sala', on: false }];
    if (lamp) cinema.push({ target: lamp.entityId, on: true, brightness: 20 });
    const scenes: TvSceneDto[] = [];
    if (sala.length || lamp)
      scenes.push({ id: 'cinema', name: 'Modo cinema', icon: 'film', hint: lamp ? `apaga a sala, ${lamp.name} em 20%` : 'apaga as luzes da sala', steps: cinema });
    scenes.push(
      { id: 'boa-noite', name: 'Boa noite', icon: 'moon', hint: 'apaga todas as luzes', steps: [{ target: 'lights', on: false }] },
      { id: 'acender', name: 'Acender tudo', icon: 'sun', hint: 'todas as luzes', steps: [{ target: 'lights', on: true }] },
      { id: 'apagar', name: 'Apagar tudo', icon: 'off', hint: 'todas as luzes', steps: [{ target: 'lights', on: false }] },
    );
    return scenes;
  }

  /** As mais usadas nos últimos 30 dias (histórico de comandos); completa com as luzes em ordem alfabética. */
  async autoFavorites(list: DeviceDto[]): Promise<string[]> {
    const usable = new Map(list.filter(isToggle).map((d) => [d.entityId, d]));
    const since = new Date(Date.now() - FAV_DAYS * 86_400_000);
    const rows = await this.db.actionLog
      .groupBy({ by: ['target'], where: { createdAt: { gte: since }, success: true, tool: { in: USE_TOOLS }, target: { not: null } }, _count: { _all: true } })
      .catch(() => [] as { target: string | null; _count: { _all: number } }[]);
    const used = rows
      .filter((r) => r.target && usable.has(r.target))
      .sort((a, b) => b._count._all - a._count._all)
      .map((r) => r.target!);
    const out = used.slice(0, FAV_MAX);
    for (const d of [...usable.values()].filter(isLight).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) {
      if (out.length >= FAV_MAX) break;
      if (!out.includes(d.entityId)) out.push(d.entityId);
    }
    return out;
  }

  async get(): Promise<TvPanelDto> {
    const saved = this.read();
    const list = await this.devices.list({ includeHidden: true });
    const known = new Set(list.map((d) => d.entityId));
    const favorites = saved.favorites ? saved.favorites.filter((id) => known.has(id)) : await this.autoFavorites(list);
    return { scenes: saved.scenes ?? this.defaultScenes(list), scenesDefault: !saved.scenes, favorites, favoritesAuto: !saved.favorites };
  }

  async save(patch: { scenes?: TvSceneDto[] | null; favorites?: string[] | null }): Promise<TvPanelDto> {
    const saved = this.read();
    const list = await this.devices.list({ includeHidden: true });
    const known = new Set(list.map((d) => d.entityId));
    if (patch.favorites !== undefined) {
      const bad = patch.favorites?.find((id) => !known.has(id));
      if (bad) throw badRequest(`Aparelho não encontrado: ${bad}`);
      saved.favorites = patch.favorites;
    }
    if (patch.scenes !== undefined) {
      for (const s of patch.scenes ?? [])
        for (const st of s.steps)
          if (st.target !== 'lights' && !st.target.startsWith('room:') && !known.has(st.target)) throw badRequest(`Aparelho não encontrado: ${st.target}`);
      saved.scenes = patch.scenes;
    }
    this.write(saved);
    return this.get();
  }

  /** Aparelhos de um passo (sempre entidades reais e controláveis). */
  private targets(step: TvSceneStep, list: DeviceDto[]): DeviceDto[] {
    if (step.target === 'lights') return list.filter(isLight);
    if (step.target.startsWith('room:')) {
      const room = normalize(step.target.slice(5));
      return list.filter((d) => isLight(d) && normalize(d.name).includes(room));
    }
    const d = list.find((x) => x.entityId === step.target);
    return d && d.controllable ? [d] : [];
  }

  /** Executa a cena. Passos seguintes vencem os anteriores (cinema: apaga a sala e depois acende a luminária). */
  async run(id: string, actor: Actor) {
    const scene = (await this.get()).scenes.find((s) => s.id === id);
    if (!scene) throw notFound('Cena não encontrada.');
    const list = (await this.devices.list({ includeHidden: true })).filter((d) => d.available);
    const plan = new Map<string, { d: DeviceDto; step: TvSceneStep }>();
    for (const step of scene.steps) for (const d of this.targets(step, list)) plan.set(d.entityId, { d, step });
    const results = await Promise.all(
      [...plan.values()].map(async ({ d, step }) => {
        try {
          if (!step.on) {
            if (d.isOn !== false) await this.devices.turnOff(d.entityId, actor);
          } else if (step.brightness && d.supportsBrightness) await this.devices.setBrightness(d.entityId, step.brightness, actor);
          else if (d.isOn !== true) await this.devices.turnOn(d.entityId, actor);
          return null;
        } catch (err) {
          return `${d.name}: ${(err as Error).message}`;
        }
      }),
    );
    const failed = results.filter((r): r is string => !!r);
    return { ok: failed.length === 0, count: plan.size, failed };
  }
}
