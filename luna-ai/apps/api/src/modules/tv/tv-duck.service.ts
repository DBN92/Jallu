import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HomeAssistantRestClient } from '../../integrations/home-assistant/rest-client';
import type { HaState } from '../../integrations/home-assistant/types';
import { badRequest } from '../../lib/errors';

/** media_player: recursos que importam aqui (MediaPlayerEntityFeature) */
const F_PAUSE = 1;
const F_VOLUME_SET = 4;
const F_VOLUME_MUTE = 8;
/** Se ninguém avisar o fim da conversa (app fechou, sem internet), a TV volta sozinha */
const SAFETY_MS = 90_000;

export interface TvOption {
  entityId: string;
  name: string;
  state: string;
  canMute: boolean;
  canVolume: boolean;
}

/**
 * “Abaixar a TV” enquanto a Luna escuta: a TV fica perto do tablet e o microfone mistura a fala dela
 * com o pedido. Ao chamar a Luna, silencia a TV escolhida (ou abaixa o volume, se ela não tiver mudo);
 * ao terminar, devolve exatamente como estava. Só mexe se a TV estiver ligada e não mexe no que a
 * pessoa já tinha feito (TV já no mudo continua no mudo).
 */
export class TvDuckService {
  private file: string;
  private ducked: { entityId: string; how: 'mute' | 'volume'; volume?: number } | null = null;
  private safety: NodeJS.Timeout | null = null;

  constructor(
    private readonly ha: HomeAssistantRestClient,
    dataDir: string,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'tv-duck.json');
  }

  config(): { entityId: string | null } {
    try {
      const v = JSON.parse(readFileSync(this.file, 'utf8')) as { entityId?: unknown };
      return { entityId: typeof v.entityId === 'string' ? v.entityId : null };
    } catch {
      return { entityId: null };
    }
  }

  /** TVs e aparelhos de som do Home Assistant que dá para silenciar ou abaixar */
  async options(): Promise<TvOption[]> {
    const all = await this.ha.getStates();
    return all
      .filter((s) => s.entity_id.startsWith('media_player.'))
      .map((s) => {
        const f = Number(s.attributes.supported_features) || 0;
        return { entityId: s.entity_id, name: String(s.attributes.friendly_name ?? s.entity_id), state: s.state, canMute: (f & F_VOLUME_MUTE) !== 0, canVolume: (f & F_VOLUME_SET) !== 0 };
      })
      .filter((o) => o.canMute || o.canVolume)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async setEntity(entityId: string | null) {
    if (entityId) {
      const ok = (await this.options()).some((o) => o.entityId === entityId);
      if (!ok) throw badRequest('Escolha uma TV que exista no Home Assistant e aceite mudo ou volume.');
    }
    await this.restore();
    writeFileSync(this.file, JSON.stringify({ entityId }));
    return this.config();
  }

  /** A Luna começou a escutar: silencia a TV (se estiver ligada) */
  async duck() {
    const { entityId } = this.config();
    if (!entityId || this.ducked) return this.keepAlive();
    const s: HaState | null = await this.ha.getState(entityId).catch(() => null);
    if (!s || ['off', 'standby', 'unavailable', 'unknown', 'idle'].includes(s.state)) return;
    const f = Number(s.attributes.supported_features) || 0;
    if (f & F_VOLUME_MUTE) {
      if (s.attributes.is_volume_muted === true) return; // já estava no mudo: não é nosso
      await this.ha.callService('media_player', 'volume_mute', { entity_id: entityId, is_volume_muted: true });
      this.ducked = { entityId, how: 'mute' };
    } else if (f & F_VOLUME_SET && typeof s.attributes.volume_level === 'number') {
      const volume = s.attributes.volume_level;
      await this.ha.callService('media_player', 'volume_set', { entity_id: entityId, volume_level: Math.min(volume, 0.05) });
      this.ducked = { entityId, how: 'volume', volume };
    } else if (f & F_PAUSE) {
      return;
    }
    this.keepAlive();
  }

  private keepAlive() {
    if (!this.ducked) return;
    if (this.safety) clearTimeout(this.safety);
    this.safety = setTimeout(() => void this.restore().catch(() => undefined), SAFETY_MS);
    this.safety.unref();
  }

  /** A conversa terminou: devolve a TV como estava */
  async restore() {
    if (this.safety) clearTimeout(this.safety);
    this.safety = null;
    const d = this.ducked;
    if (!d) return;
    this.ducked = null;
    if (d.how === 'mute') await this.ha.callService('media_player', 'volume_mute', { entity_id: d.entityId, is_volume_muted: false });
    else await this.ha.callService('media_player', 'volume_set', { entity_id: d.entityId, volume_level: d.volume });
  }
}
