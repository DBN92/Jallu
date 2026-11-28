import { create } from 'zustand';
import type { PeopleConfigDto, PersonDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';

interface PeopleState {
  list: PersonDto[] | null;
  config: PeopleConfigDto | null;
  load: () => Promise<void>;
  saveConfig: (patch: Partial<PeopleConfigDto>) => Promise<string | null>;
}

export const usePeople = create<PeopleState>((set) => ({
  list: null,
  config: null,
  load: async () => {
    try {
      const [list, config] = await Promise.all([api<PersonDto[]>('/api/people'), api<PeopleConfigDto>('/api/people/config')]);
      set({ list, config });
    } catch {
      set({ list: [] });
    }
  },
  saveConfig: async (patch) => {
    try {
      set({ config: await api<PeopleConfigDto>('/api/people/config', { method: 'PUT', body: patch }) });
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  },
}));
