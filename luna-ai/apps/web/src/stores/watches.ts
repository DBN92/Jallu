import { create } from 'zustand';
import type { CameraEventDto, WatchDto } from '@luna/shared/types';
import { api } from '../services/api';

interface WatchesState {
  watches: WatchDto[] | null;
  events: CameraEventDto[];
  load: () => Promise<void>;
  loadEvents: () => Promise<void>;
  /** Evento ao vivo vindo do servidor */
  push: (e: CameraEventDto) => void;
}

/** Vigias da garagem (carro, portão, movimento) e os últimos acontecimentos com foto. */
export const useWatches = create<WatchesState>((set, get) => ({
  watches: null,
  events: [],
  load: async () => set({ watches: await api<WatchDto[]>('/api/watches').catch(() => []) }),
  loadEvents: async () => set({ events: await api<CameraEventDto[]>('/api/camera-events?limit=20').catch(() => []) }),
  push: (e) => {
    set((s) => ({ events: [e, ...s.events.filter((x) => x.id !== e.id)].slice(0, 20) }));
    void get().load(); // estado novo do carro/portão
  },
}));

export const eventEmoji = (e: CameraEventDto) => (e.kind === 'motion' ? '👀' : e.kind === 'alert' ? '⚠️' : /carro/i.test(e.title) ? '🚗' : /port[aã]o/i.test(e.title) ? '🚪' : '📷');
