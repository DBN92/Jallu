import { create } from 'zustand';
import type { ActionResult, AssistantState, ChatResponse } from '@luna/shared';
import { api, errorMessage } from '../services/api';
import { useLocation } from './location';
import { useSettings } from './settings';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
  channel?: string;
  actions?: ActionResult[];
  notices?: string[];
  error?: boolean;
  createdAt: string;
}

interface AssistantStore {
  state: AssistantState;
  conversationId: string | null;
  messages: UiMessage[];
  interim: string;
  serverConnected: boolean;
  setState: (s: AssistantState) => void;
  setInterim: (t: string) => void;
  setServerConnected: (c: boolean) => void;
  send: (text: string, channel?: 'text' | 'voice') => Promise<ChatResponse | null>;
  appendLocal: (m: Omit<UiMessage, 'id' | 'createdAt'>) => void;
  newConversation: () => void;
  openConversation: (id: string) => Promise<void>;
  setConversationId: (id: string) => void;
}

const uid = () => Math.random().toString(36).slice(2);

async function currentCoords() {
  if (!useSettings.getState().useGps) return undefined;
  return (await useLocation.getState().request()) ?? undefined;
}

export const useAssistant = create<AssistantStore>((set, get) => ({
  state: 'idle',
  conversationId: null,
  messages: [],
  interim: '',
  serverConnected: true,
  setState: (state) => set({ state }),
  setInterim: (interim) => set({ interim }),
  setServerConnected: (serverConnected) => set({ serverConnected, ...(serverConnected ? {} : {}) }),
  appendLocal: (m) => set((s) => ({ messages: [...s.messages, { ...m, id: uid(), createdAt: new Date().toISOString() }] })),
  send: async (text, channel = 'text') => {
    const message = text.trim();
    if (!message) return null;
    set((s) => ({ state: 'processing', interim: '', messages: [...s.messages, { id: uid(), role: 'user', content: message, channel, createdAt: new Date().toISOString() }] }));
    try {
      // Localização só é enviada se o usuário habilitou o GPS e a pergunta pode precisar dela
      const needsLocation = /chuv|tempo|clima|temperatura|guarda|frio|calor|previs/i.test(message);
      const location = needsLocation ? await currentCoords() : undefined;
      const res = await api<ChatResponse>('/api/chat', { body: { message, channel, conversationId: get().conversationId ?? undefined, location } });
      set((s) => ({
        conversationId: res.conversationId,
        state: 'idle',
        messages: [
          ...s.messages,
          { id: res.messageId, role: 'assistant', content: res.reply, provider: res.provider, actions: res.actions, notices: res.notices, channel, createdAt: new Date().toISOString() },
        ],
      }));
      return res;
    } catch (err) {
      set((s) => ({
        state: 'error',
        messages: [...s.messages, { id: uid(), role: 'assistant', content: errorMessage(err), error: true, createdAt: new Date().toISOString() }],
      }));
      setTimeout(() => get().state === 'error' && set({ state: 'idle' }), 4000);
      return null;
    }
  },
  newConversation: () => set({ conversationId: null, messages: [], state: 'idle' }),
  setConversationId: (conversationId) => set({ conversationId }),
  openConversation: async (id) => {
    const c = await api<{ id: string; messages: (UiMessage & { actions: ActionResult[] })[] }>(`/api/conversations/${id}`);
    set({ conversationId: c.id, messages: c.messages, state: 'idle' });
  },
}));
