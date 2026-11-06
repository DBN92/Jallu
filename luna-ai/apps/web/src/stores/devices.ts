import { create } from 'zustand';
import type { DeviceDto } from '@luna/shared';
import { api, errorMessage } from '../services/api';

interface DevicesState {
  devices: Record<string, DeviceDto>;
  loading: boolean;
  error: string | null;
  haConnected: boolean | null;
  busy: Record<string, boolean>;
  load: (all?: boolean) => Promise<void>;
  upsert: (d: DeviceDto) => void;
  setHa: (c: boolean) => void;
  toggle: (d: DeviceDto) => Promise<void>;
  brightness: (entityId: string, value: number) => Promise<void>;
  /** Retorna a mensagem de erro (ou null se deu certo). */
  update: (entityId: string, patch: { aiAllowed?: boolean; aliases?: string[]; hidden?: boolean; name?: string | null }) => Promise<string | null>;
}

export const useDevices = create<DevicesState>((set, get) => ({
  devices: {},
  loading: false,
  error: null,
  haConnected: null,
  busy: {},
  load: async (all = true) => {
    set({ loading: true });
    try {
      const list = await api<DeviceDto[]>(`/api/devices${all ? '?all=1' : ''}`);
      set({ devices: Object.fromEntries(list.map((d) => [d.entityId, d])), error: null });
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },
  upsert: (d) => set((s) => ({ devices: { ...s.devices, [d.entityId]: { ...s.devices[d.entityId], ...d } } })),
  setHa: (c) => set({ haConnected: c }),
  toggle: async (d) => {
    // Resposta imediata na tela (otimista); o estado real do servidor confirma em seguida
    const before = get().devices[d.entityId] ?? d;
    const wantOn = !before.isOn;
    set((s) => ({
      busy: { ...s.busy, [d.entityId]: true },
      devices: { ...s.devices, [d.entityId]: { ...before, isOn: wantOn, state: wantOn ? 'on' : 'off' } },
    }));
    try {
      const after = await api<DeviceDto>(`/api/devices/${d.entityId}/${wantOn ? 'turn-on' : 'turn-off'}`, { method: 'POST' });
      get().upsert(after);
      set({ error: null });
    } catch (err) {
      // Não deu certo: volta ao estado anterior e mostra o motivo
      set((s) => ({ devices: { ...s.devices, [d.entityId]: before }, error: errorMessage(err) }));
    } finally {
      set((s) => ({ busy: { ...s.busy, [d.entityId]: false } }));
    }
  },
  brightness: async (entityId, value) => {
    set((s) => ({ busy: { ...s.busy, [entityId]: true } }));
    try {
      get().upsert(await api<DeviceDto>(`/api/devices/${entityId}/brightness`, { body: { brightness: value } }));
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      set((s) => ({ busy: { ...s.busy, [entityId]: false } }));
    }
  },
  update: async (entityId, patch) => {
    try {
      get().upsert(await api<DeviceDto>(`/api/devices/${entityId}`, { method: 'PATCH', body: patch }));
      return null;
    } catch (err) {
      const msg = errorMessage(err);
      set({ error: msg });
      return msg;
    }
  },
}));
