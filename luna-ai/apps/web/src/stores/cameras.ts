import { create } from 'zustand';
import type { CameraDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { nativeApp } from '../lib/native';

interface CamerasState {
  cameras: CameraDto[] | null;
  error: string | null;
  /** Câmeras abertas no visualizador em tela cheia (null = fechado). */
  viewing: string[] | null;
  load: () => Promise<void>;
  open: (ids: string[]) => void;
  close: () => void;
}

export const useCameras = create<CamerasState>((set, get) => ({
  cameras: null,
  error: null,
  viewing: null,
  load: async () => {
    try {
      set({ cameras: await api<CameraDto[]>('/api/cameras'), error: null });
    } catch (err) {
      // Falha passageira na atualização automática: mantém a lista que já estava na tela
      set({ cameras: get().cameras ?? [], error: errorMessage(err) });
    }
  },
  open: (ids) => {
    // Câmera que só abre no site do fabricante (ex.: babá Smart Life): vai direto para o site
    if (ids[0]?.startsWith('camera.web_')) {
      const go = (list: CameraDto[] | null) => {
        const url = list?.find((c) => c.entityId === ids[0])?.webUrl;
        if (url && openWebCamera(url)) return;
        set({ viewing: ids });
      };
      if (get().cameras) go(get().cameras);
      else void get().load().then(() => go(get().cameras));
      return;
    }
    set({ viewing: ids });
  },
  close: () => set({ viewing: null }),
}));

/**
 * Abre o site da câmera. No app Android a navegação vai para o Chrome (o app só abre a Luna dentro dele,
 * e o site não ganha acesso aos controles do app); o botão Voltar traz de volta. No navegador, abre outra aba.
 */
export function openWebCamera(url: string): boolean {
  if (nativeApp()) {
    window.location.assign(url);
    return true;
  }
  const w = window.open(url, '_blank');
  if (!w) return false;
  w.opener = null;
  return true;
}
