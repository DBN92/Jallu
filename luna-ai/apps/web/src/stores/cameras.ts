import { create } from 'zustand';
import type { CameraDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';

interface CamerasState {
  cameras: CameraDto[] | null;
  error: string | null;
  /** Câmeras abertas no visualizador em tela cheia (null = fechado). */
  viewing: string[] | null;
  load: () => Promise<void>;
  open: (ids: string[]) => void;
  close: () => void;
}

export const useCameras = create<CamerasState>((set) => ({
  cameras: null,
  error: null,
  viewing: null,
  load: async () => {
    try {
      set({ cameras: await api<CameraDto[]>('/api/cameras'), error: null });
    } catch (err) {
      set({ cameras: [], error: errorMessage(err) });
    }
  },
  open: (ids) => set({ viewing: ids }),
  close: () => set({ viewing: null }),
}));
