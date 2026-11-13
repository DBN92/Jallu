import { create } from 'zustand';
import type { RecadoDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';

interface RecadosState {
  list: RecadoDto[] | null;
  /** Tela aberta agora: gravar um recado ou assistir aos recados */
  view: 'recorder' | 'player' | null;
  load: () => Promise<void>;
  upload: (video: Blob) => Promise<string | null>;
  seen: (id: string) => Promise<void>;
  save: (id: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  open: (view: 'recorder' | 'player') => void;
  close: () => void;
}

export const useRecados = create<RecadosState>((set) => ({
  list: null,
  view: null,
  load: async () => {
    try {
      set({ list: await api<RecadoDto[]>('/api/recados') });
    } catch {
      /* sem conexão agora: mantém a lista anterior */
    }
  },
  upload: async (video) => {
    try {
      const form = new FormData();
      form.append('video', video, video.type.includes('mp4') ? 'recado.mp4' : 'recado.webm');
      set({ list: await api<RecadoDto[]>('/api/recados', { method: 'POST', form }) });
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  },
  seen: async (id) => {
    try {
      set({ list: await api<RecadoDto[]>(`/api/recados/${id}/seen`, { method: 'POST' }) });
    } catch {
      /* tenta de novo na próxima vez */
    }
  },
  save: async (id) => {
    try {
      set({ list: await api<RecadoDto[]>(`/api/recados/${id}/save`, { method: 'POST' }) });
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  },
  remove: async (id) => {
    try {
      set({ list: await api<RecadoDto[]>(`/api/recados/${id}`, { method: 'DELETE' }) });
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  },
  open: (view) => set({ view }),
  close: () => set({ view: null }),
}));

export const unseenRecados = (list: RecadoDto[] | null) => (list ?? []).filter((r) => !r.seen);
