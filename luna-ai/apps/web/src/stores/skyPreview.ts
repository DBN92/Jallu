import { create } from 'zustand';

/** Prévia do tema Céu (Ajustes): força um tempo/hora por 1 minuto para ver como fica. */
export interface SkyPreview {
  label: string;
  /** Código WMO do tempo */
  code: number;
  wind?: number;
  /** Hora do dia a simular (opcional) */
  hour?: number;
}

interface State {
  preview: SkyPreview | null;
  show: (p: SkyPreview | null) => void;
}

let timer = 0;
export const useSkyPreview = create<State>((set) => ({
  preview: null,
  show: (preview) => {
    clearTimeout(timer);
    set({ preview });
    if (preview) timer = window.setTimeout(() => set({ preview: null }), 60_000);
  },
}));
