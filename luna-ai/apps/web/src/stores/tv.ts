import { create } from 'zustand';
import type { AssistantState } from '@luna/shared';

export interface RemoteReply {
  userText: string;
  reply: string;
  cameraIds: string[];
  at: number;
}

/** O que acontece nas outras telas do usuário (ex.: pedido feito pelo celular), para a TV mostrar. */
interface TvStore {
  remoteState: AssistantState;
  lastReply: RemoteReply | null;
  setRemoteState: (s: AssistantState) => void;
  pushReply: (r: Omit<RemoteReply, 'at'>) => void;
  clearReply: () => void;
}

export const useTv = create<TvStore>((set) => ({
  remoteState: 'idle',
  lastReply: null,
  setRemoteState: (remoteState) => set({ remoteState }),
  pushReply: (r) => set({ lastReply: { ...r, at: Date.now() }, remoteState: 'idle' }),
  clearReply: () => set({ lastReply: null }),
}));
