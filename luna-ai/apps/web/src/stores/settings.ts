import { create } from 'zustand';
import type { SettingsDto, SettingsUpdate } from '@luna/shared';
import { api } from '../services/api';

export type VoiceMode = 'basic' | 'realtime';

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* modo privado */
  }
};

interface SettingsState {
  settings: SettingsDto | null;
  /** Preferências locais deste aparelho (não sensíveis) */
  voiceMode: VoiceMode;
  useGps: boolean;
  load: () => Promise<void>;
  update: (patch: SettingsUpdate) => Promise<void>;
  setHome: (home: { name: string; latitude: number; longitude: number } | null) => Promise<void>;
  setVoiceMode: (m: VoiceMode) => void;
  setUseGps: (v: boolean) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  voiceMode: readLocal<VoiceMode>('luna.voiceMode', 'basic'),
  useGps: readLocal<boolean>('luna.useGps', false),
  load: async () => set({ settings: await api<SettingsDto>('/api/settings') }),
  update: async (patch) => set({ settings: await api<SettingsDto>('/api/settings', { method: 'PATCH', body: patch }) }),
  setHome: async (home) =>
    set({ settings: home ? await api<SettingsDto>('/api/location/home', { method: 'PUT', body: home }) : await api<SettingsDto>('/api/location/home', { method: 'DELETE' }) }),
  setVoiceMode: (voiceMode) => {
    writeLocal('luna.voiceMode', voiceMode);
    set({ voiceMode });
  },
  setUseGps: (useGps) => {
    writeLocal('luna.useGps', useGps);
    set({ useGps });
  },
}));
