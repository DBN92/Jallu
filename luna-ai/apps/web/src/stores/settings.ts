import { create } from 'zustand';
import type { SettingsDto, SettingsUpdate } from '@luna/shared';
import { api } from '../services/api';
import { isTvDevice } from '../lib/tv';
import type { Sensitivity } from '../gestures/stabilizer';
import { applyTheme, DEFAULT_THEME, isTheme, type ThemeId } from '../lib/theme';

export type VoiceMode = 'basic' | 'realtime';
export type ScreenOrientationPref = 'auto' | 'landscape' | 'portrait';
/** Modo TV: automático (Fire TV/Android TV), sempre ou nunca. */
export type TvModePref = 'auto' | 'on' | 'off';
/** O que o descanso de tela pode mostrar, além do relógio */
export const AMBIENT_SLIDES = ['weather', 'home', 'house3d', 'cameras', 'photos'] as const;
/** As câmeras só entram no descanso de tela se forem escolhidas nos ajustes */
const AMBIENT_DEFAULT: AmbientSlide[] = ['weather', 'home', 'house3d', 'photos'];
export type AmbientSlide = (typeof AMBIENT_SLIDES)[number];
/** Tempos de espera (em segundos) oferecidos para o descanso de tela começar */
export const AMBIENT_DELAYS = [45, 120, 300, 600] as const;

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
  /** O que o descanso de tela alterna neste aparelho (vazio: só o relógio) */
  ambientSlides: AmbientSlide[];
  /** Segundos sem uso até o descanso de tela começar */
  ambientDelay: number;
  /** Orientação forçada neste aparelho (app instalado). */
  orientation: ScreenOrientationPref;
  tvMode: TvModePref;
  /** Este aparelho analisa gestos de mão (câmeras com regras e/ou a câmera dele). */
  gestureWatch: boolean;
  /** Sensibilidade dos gestos neste aparelho */
  gestureSensitivity: Sensitivity;
  /** Tema visual deste aparelho */
  theme: ThemeId;
  load: () => Promise<void>;
  update: (patch: SettingsUpdate) => Promise<void>;
  setHome: (home: { name: string; latitude: number; longitude: number } | null) => Promise<void>;
  setVoiceMode: (m: VoiceMode) => void;
  setUseGps: (v: boolean) => void;
  setKioskMode: (v: boolean) => void;
  setOrientation: (v: ScreenOrientationPref) => void;
  setAmbientMode: (v: boolean) => void;
  setAmbientSlides: (v: AmbientSlide[]) => void;
  setAmbientDelay: (v: number) => void;
  setTvMode: (v: TvModePref) => void;
  setGestureWatch: (v: boolean) => void;
  setGestureSensitivity: (v: Sensitivity) => void;
  setTheme: (v: ThemeId) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  voiceMode: readLocal<VoiceMode>('luna.voiceMode', 'basic'),
  useGps: readLocal<boolean>('luna.useGps', false),
  kioskMode: readLocal<boolean>('luna.kioskMode', false),
  orientation: readLocal<ScreenOrientationPref>('luna.orientation', 'auto'),
  ambientMode: readLocal<boolean>('luna.ambientMode', true),
  ambientSlides: ((v) => (Array.isArray(v) ? AMBIENT_SLIDES.filter((s) => v.includes(s)) : AMBIENT_DEFAULT))(readLocal<unknown>('luna.ambientSlides', null)),
  ambientDelay: ((v) => ((AMBIENT_DELAYS as readonly number[]).includes(v) ? v : 45))(readLocal<number>('luna.ambientDelay', 45)),
  tvMode: readLocal<TvModePref>('luna.tvMode', 'auto'),
  gestureWatch: readLocal<boolean>('luna.gestureWatch', false),
  gestureSensitivity: readLocal<Sensitivity>('luna.gestureSensitivity', 'normal'),
  theme: ((t) => (isTheme(t) ? t : DEFAULT_THEME))(readLocal<string>('luna.theme', DEFAULT_THEME)),
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
  setAmbientSlides: (v) => {
    const ambientSlides = AMBIENT_SLIDES.filter((s) => v.includes(s));
    writeLocal('luna.ambientSlides', ambientSlides);
    set({ ambientSlides });
  },
  setAmbientDelay: (ambientDelay) => {
    writeLocal('luna.ambientDelay', ambientDelay);
    set({ ambientDelay });
  },
  setTheme: (theme) => {
    writeLocal('luna.theme', theme);
    applyTheme(theme);
    set({ theme });
  },
  setGestureSensitivity: (gestureSensitivity) => {
    writeLocal('luna.gestureSensitivity', gestureSensitivity);
    set({ gestureSensitivity });
  },
  setGestureWatch: (gestureWatch) => {
    writeLocal('luna.gestureWatch', gestureWatch);
    set({ gestureWatch });
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
