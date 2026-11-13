import { create } from 'zustand';
import type { NoteDto, PantryItemDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';

interface ListsState {
  items: PantryItemDto[] | null;
  notes: NoteDto[] | null;
  error: string | null;
  load: () => Promise<void>;
  /** Executa uma mudança e recarrega; devolve a mensagem de erro, se houver */
  run: (fn: () => Promise<unknown>) => Promise<string | null>;
}

export const useLists = create<ListsState>((set, get) => ({
  items: null,
  notes: null,
  error: null,
  load: async () => {
    try {
      const [items, notes] = await Promise.all([api<PantryItemDto[]>('/api/lists/items'), api<NoteDto[]>('/api/lists/notes')]);
      set({ items, notes, error: null });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },
  run: async (fn) => {
    try {
      await fn();
      await get().load();
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  },
}));

export const listApi = {
  add: (name: string, status: 'have' | 'buy') => api('/api/lists/items', { body: { name, status } }),
  patch: (id: string, patch: Partial<Pick<PantryItemDto, 'name' | 'status' | 'quantity'>>) => api(`/api/lists/items/${id}`, { method: 'PATCH', body: patch }),
  remove: (id: string) => api(`/api/lists/items/${id}`, { method: 'DELETE' }),
  boughtAll: () => api('/api/lists/items/bought-all', { method: 'POST' }),
  addNote: (text: string) => api('/api/lists/notes', { body: { text } }),
  patchNote: (id: string, patch: { text?: string; pinned?: boolean }) => api(`/api/lists/notes/${id}`, { method: 'PATCH', body: patch }),
  removeNote: (id: string) => api(`/api/lists/notes/${id}`, { method: 'DELETE' }),
};
