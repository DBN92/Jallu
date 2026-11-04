import { create } from 'zustand';
import type { PublicUser } from '@luna/shared';
import { api } from '../services/api';

type Status = 'loading' | 'setup' | 'login' | 'ready' | 'offline';

interface AuthState {
  status: Status;
  user: PublicUser | null;
  check: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  setup: (input: { username: string; password: string; displayName: string; setupCode: string }) => Promise<void>;
  logout: () => Promise<void>;
  expire: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  check: async () => {
    try {
      const s = await api<{ needsSetup: boolean; user: PublicUser | null }>('/api/auth/status');
      set({ user: s.user, status: s.needsSetup ? 'setup' : s.user ? 'ready' : 'login' });
    } catch {
      set({ status: 'offline' });
    }
  },
  login: async (username, password) => {
    const r = await api<{ user: PublicUser }>('/api/auth/login', { body: { username, password } });
    set({ user: r.user, status: 'ready' });
  },
  setup: async (input) => {
    const r = await api<{ user: PublicUser }>('/api/auth/setup', { body: input });
    set({ user: r.user, status: 'ready' });
  },
  logout: async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    set({ user: null, status: 'login' });
  },
  expire: () => set({ user: null, status: 'login' }),
}));
