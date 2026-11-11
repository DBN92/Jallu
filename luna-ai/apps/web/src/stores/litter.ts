import { create } from 'zustand';
import type { LitterBoxDto } from '@luna/shared';
import { api, errorMessage } from '../services/api';

interface LitterState {
  boxes: LitterBoxDto[] | null;
  busy: boolean;
  load: () => Promise<void>;
  clean: (id: string) => Promise<string | null>;
  setAuto: (id: string, on: boolean, delaySeconds?: number) => Promise<string | null>;
  setVoice: (id: string, allowed: boolean) => Promise<string | null>;
  updateCat: (catId: string, patch: { name?: string; weightKg?: number | null }) => Promise<string | null>;
}

/** Caixas de areia (normalmente uma). Atualiza sozinha quando o servidor avisa (litter_update). */
export const useLitter = create<LitterState>((set) => {
  const replace = (box: LitterBoxDto) => set((s) => ({ boxes: (s.boxes ?? []).map((b) => (b.id === box.id ? box : b)) }));
  const run = async (fn: () => Promise<unknown>) => {
    set({ busy: true });
    try {
      await fn();
      return null;
    } catch (err) {
      return errorMessage(err);
    } finally {
      set({ busy: false });
    }
  };
  return {
    boxes: null,
    busy: false,
    load: async () => {
      try {
        set({ boxes: await api<LitterBoxDto[]>('/api/litter') });
      } catch {
        set((s) => ({ boxes: s.boxes ?? [] }));
      }
    },
    clean: (id) => run(async () => replace(await api<LitterBoxDto>(`/api/litter/${id}/clean`, { method: 'POST' }))),
    setAuto: (id, on, delaySeconds) => run(async () => replace(await api<LitterBoxDto>(`/api/litter/${id}/auto`, { body: { on, delaySeconds } }))),
    setVoice: (id, allowed) => run(async () => replace(await api<LitterBoxDto>(`/api/litter/${id}/voice`, { body: { allowed } }))),
    updateCat: (catId, patch) => run(async () => set({ boxes: await api<LitterBoxDto[]>(`/api/litter/cats/${catId}`, { method: 'PATCH', body: patch }) })),
  };
});

// Usado pelo App ao receber o aviso do servidor
export const reloadLitter = () => void useLitter.getState().load();
