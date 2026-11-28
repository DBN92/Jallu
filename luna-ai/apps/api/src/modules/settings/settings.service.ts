import type { AiMode, SettingsDto } from '@luna/shared';
import type { Db } from '../../lib/db';
import { safeJson } from '../../lib/text';

const DEFAULTS = (aiMode: AiMode): Omit<SettingsDto, 'homeLocation'> => ({
  aiMode,
  voiceName: null,
  voiceRate: 1,
  autoSpeak: true,
  realtimeVoice: 'marin',
  allowCloudMemory: false,
  allowCloudTranscription: false,
  wakeWordEnabled: false,
});

export class SettingsService {
  constructor(
    private readonly db: Db,
    private readonly defaultMode: AiMode,
  ) {}

  async get(userId: string): Promise<SettingsDto> {
    const rows = await this.db.preference.findMany({ where: { userId } });
    const map = new Map(rows.map((r) => [r.key, safeJson<unknown>(r.value, null)]));
    const base = DEFAULTS(this.defaultMode) as Record<string, unknown>;
    for (const key of Object.keys(base)) if (map.has(key) && map.get(key) !== null) base[key] = map.get(key);
    return { ...(base as Omit<SettingsDto, 'homeLocation'>), homeLocation: (map.get('homeLocation') as SettingsDto['homeLocation']) ?? null };
  }

  async set(userId: string, patch: Record<string, unknown>) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      await this.db.preference.upsert({
        where: { userId_key: { userId, key } },
        create: { userId, key, value: JSON.stringify(value) },
        update: { value: JSON.stringify(value) },
      });
    }
    return this.get(userId);
  }

  async clearHome(userId: string) {
    await this.db.preference.deleteMany({ where: { userId, key: 'homeLocation' } });
    return this.get(userId);
  }
}
