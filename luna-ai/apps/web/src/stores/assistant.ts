import { create } from 'zustand';
import type { ActionResult, AssistantState, ChatResponse } from '@luna/shared';
import { api, apiStream, ApiError, errorMessage } from '../services/api';
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
  /** onDelta: recebe o texto da resposta enquanto é gerado (para a voz começar antes). */
  send: (text: string, channel?: 'text' | 'voice', onDelta?: (text: string) => void) => Promise<ChatResponse | null>;
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
  send: async (text, channel = 'text', onDelta) => {
    const message = text.trim();
    if (!message) return null;
    const draftId = `draft-${uid()}`;
    set((s) => ({ state: 'processing', interim: '', messages: [...s.messages, { id: uid(), role: 'user', content: message, channel, createdAt: new Date().toISOString() }] }));
    try {
      // Localização só é enviada se o usuário habilitou o GPS e a pergunta pode precisar dela
      const needsLocation = /chuv|tempo|clima|temperatura|guarda|frio|calor|previs/i.test(message);
      const location = needsLocation ? await currentCoords() : undefined;
      let res: ChatResponse | null = null;
      let streamError: string | null = null;
      await apiStream('/api/chat/stream', { message, channel, conversationId: get().conversationId ?? undefined, location }, (event, data) => {
        if (event === 'delta') {
          const piece = (data as { text: string }).text;
          onDelta?.(piece);
          // Mostra a resposta crescendo na tela
          set((s) => {
            const exists = s.messages.some((m) => m.id === draftId);
            return {
              messages: exists
                ? s.messages.map((m) => (m.id === draftId ? { ...m, content: m.content + piece } : m))
                : [...s.messages, { id: draftId, role: 'assistant', content: piece, channel, createdAt: new Date().toISOString() }],
            };
          });
        } else if (event === 'done') res = data as ChatResponse;
        else if (event === 'error') streamError = (data as { message: string }).message;
      });
      if (!res) throw new ApiError(500, streamError ?? 'A resposta foi interrompida.');
      const final: ChatResponse = res;
      set((s) => ({
        conversationId: final.conversationId,
        state: 'idle',
        messages: [
          ...s.messages.filter((m) => m.id !== draftId),
          { id: final.messageId, role: 'assistant', content: final.reply, provider: final.provider, actions: final.actions, notices: final.notices, channel, createdAt: new Date().toISOString() },
        ],
      }));
      return final;
    } catch (err) {
      set((s) => ({
        state: 'error',
        messages: [...s.messages.filter((m) => m.id !== draftId), { id: uid(), role: 'assistant', content: errorMessage(err), error: true, createdAt: new Date().toISOString() }],
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
