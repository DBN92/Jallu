import { create } from 'zustand';
import type { SettingsDto, SettingsUpdate } from '@luna/shared';
import { api } from '../services/api';
import { isTvDevice } from '../lib/tv';

export type VoiceMode = 'basic' | 'realtime';
export type ScreenOrientationPref = 'auto' | 'landscape' | 'portrait';
/** Modo TV: automático (Fire TV/Android TV), sempre ou nunca. */
export type TvModePref = 'auto' | 'on' | 'off';

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
  /** Aparelho dedicado: tela sempre acesa e volta sozinho para a tela inicial. */
  kioskMode: boolean;
  /** Tela ambiente (clima/casa alternando) quando a Luna fica sem uso. */
  ambientMode: boolean;
  /** Orientação forçada neste aparelho (app instalado). */
  orientation: ScreenOrientationPref;
  tvMode: TvModePref;
  load: () => Promise<void>;
  update: (patch: SettingsUpdate) => Promise<void>;
  setHome: (home: { name: string; latitude: number; longitude: number } | null) => Promise<void>;
  setVoiceMode: (m: VoiceMode) => void;
  setUseGps: (v: boolean) => void;
  setKioskMode: (v: boolean) => void;
  setOrientation: (v: ScreenOrientationPref) => void;
  setAmbientMode: (v: boolean) => void;
  setTvMode: (v: TvModePref) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  voiceMode: readLocal<VoiceMode>('luna.voiceMode', 'basic'),
  useGps: readLocal<boolean>('luna.useGps', false),
  kioskMode: readLocal<boolean>('luna.kioskMode', false),
  orientation: readLocal<ScreenOrientationPref>('luna.orientation', 'auto'),
  ambientMode: readLocal<boolean>('luna.ambientMode', true),
  tvMode: readLocal<TvModePref>('luna.tvMode', 'auto'),
  load: async () => set({ settings: await api<SettingsDto>('/api/settings') }),
  update: async (patch) => set({ settings: await api<SettingsDto>('/api/settings', { method: 'PATCH', body: patch }) }),
  setHome: async (home) =>
    set({ settings: home ? await api<SettingsDto>('/api/location/home', { method: 'PUT', body: home }) : await api<SettingsDto>('/api/location/home', { method: 'DELETE' }) }),
  setVoiceMode: (voiceMode) => {
    writeLocal('luna.voiceMode', voiceMode);
    set({ voiceMode });
  },
  setAmbientMode: (ambientMode) => {
    writeLocal('luna.ambientMode', ambientMode);
    set({ ambientMode });
  },
  setTvMode: (tvMode) => {
    writeLocal('luna.tvMode', tvMode);
    set({ tvMode });
  },
  setOrientation: (orientation) => {
    writeLocal('luna.orientation', orientation);
    set({ orientation });
  },
  setKioskMode: (kioskMode) => {
    writeLocal('luna.kioskMode', kioskMode);
    set({ kioskMode });
  },
  setUseGps: (useGps) => {
    writeLocal('luna.useGps', useGps);
    set({ useGps });
  },
}));

/** O modo TV está ativo neste aparelho? */
export const tvActive = (pref: TvModePref) => pref === 'on' || (pref === 'auto' && isTvDevice());
