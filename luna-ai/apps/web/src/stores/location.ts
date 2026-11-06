import { create } from 'zustand';
import type { Coordinates } from '@luna/shared';

type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable' | 'unsupported';

interface LocationState {
  /** Mantidas somente em memória — nunca persistidas no aparelho ou servidor. */
  coords: Coordinates | null;
  status: GeoStatus;
  message: string | null;
  at: number;
  request: () => Promise<Coordinates | null>;
  clear: () => void;
}

export const useLocation = create<LocationState>((set, get) => ({
  coords: null,
  status: 'idle',
  message: null,
  at: 0,
  request: async () => {
    if (!('geolocation' in navigator)) {
      set({ status: 'unsupported', message: 'Este navegador não oferece geolocalização.' });
      return null;
    }
    const cached = get();
    if (cached.coords && Date.now() - cached.at < 5 * 60_000) return cached.coords;
    set({ status: 'locating', message: null });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          set({ coords, status: 'ok', at: Date.now() });
          resolve(coords);
        },
        (err) => {
          const denied = err.code === err.PERMISSION_DENIED;
          set({
            status: denied ? 'denied' : 'unavailable',
            message: denied
              ? 'A localização foi bloqueada. No iPhone: Ajustes › Privacidade › Serviços de Localização › Safari (ou DIA).'
              : 'Não consegui obter sua localização agora.',
          });
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
      );
    });
  },
  clear: () => set({ coords: null, status: 'idle', at: 0 }),
}));
