import { create } from 'zustand';
import type { WasherDto } from '@luna/shared';
import { api, errorMessage } from '../services/api';

interface WasherState {
  washers: WasherDto[] | null;
  busy: boolean;
  load: () => Promise<void>;
  setPower: (id: string, on: boolean) => Promise<string | null>;
  setRunning: (id: string, on: boolean) => Promise<string | null>;
  setPrefs: (id: string, patch: { notifyDone?: boolean; speak?: boolean }) => Promise<string | null>;
  setVoice: (id: string, allowed: boolean) => Promise<string | null>;
}

/** Lava e seca (normalmente uma). Atualiza sozinha quando o servidor avisa (washer_update). */
export const useWasher = create<WasherState>((set) => {
  const replace = (w: WasherDto) => set((s) => ({ washers: (s.washers ?? []).map((x) => (x.id === w.id ? w : x)) }));
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
    washers: null,
    busy: false,
    load: async () => {
      try {
        set({ washers: await api<WasherDto[]>('/api/washer') });
      } catch {
        set((s) => ({ washers: s.washers ?? [] }));
      }
    },
    setPower: (id, on) => run(async () => replace(await api<WasherDto>(`/api/washer/${id}/power`, { body: { on } }))),
    setRunning: (id, on) => run(async () => replace(await api<WasherDto>(`/api/washer/${id}/run`, { body: { on } }))),
    setPrefs: (id, patch) => run(async () => replace(await api<WasherDto>(`/api/washer/${id}/prefs`, { method: 'PATCH', body: patch }))),
    setVoice: (id, allowed) => run(async () => replace(await api<WasherDto>(`/api/washer/${id}/voice`, { body: { allowed } }))),
  };
});

// Usado pelo App ao receber o aviso do servidor
export const reloadWasher = () => void useWasher.getState().load();
