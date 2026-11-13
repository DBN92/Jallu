import { create } from 'zustand';
import type { RecadoDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';

interface RecadosState {
  list: RecadoDto[] | null;
  /** Tela aberta agora: gravar um recado ou assistir aos recados */
  view: 'recorder' | 'player' | null;
  /** Recados gravados neste aparelho (não anuncia a chegada para quem acabou de gravar) */
  mine: string[];
  load: () => Promise<void>;
  upload: (video: Blob) => Promise<string | null>;
  seen: (id: string) => Promise<void>;
  save: (id: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  open: (view: 'recorder' | 'player') => void;
  close: () => void;
}

export const useRecados = create<RecadosState>((set, get) => ({
  list: null,
  view: null,
  mine: [],
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
      const before = new Set((get().list ?? []).map((r) => r.id));
      const list = await api<RecadoDto[]>('/api/recados', { method: 'POST', form });
      set({ list, mine: [...get().mine, ...list.filter((r) => !before.has(r.id)).map((r) => r.id)] });
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
