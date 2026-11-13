import { useEffect } from 'react';
import { create } from 'zustand';
import { acquireCamera, releaseCamera } from '../lib/deviceCamera';
import { nativeApp } from '../lib/native';
import { useSettings } from '../stores/settings';

interface PresenceState {
  /** Última vez que viu movimento na frente da câmera */
  seenAt: number;
  /** Última vez que alguém chegou perto (movimento grande, rosto/corpo perto da tela) */
  nearAt: number;
  /** Quanto da imagem mudou no último quadro (0–1), para conferir nos ajustes */
  level: number;
  status: string;
  dimmed: boolean;
  setDimmed: (v: boolean) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  seenAt: Date.now(),
  nearAt: 0,
  level: 0,
  status: 'desligado',
  dimmed: false,
  setDimmed: (dimmed) => {
    nativeApp()?.setDim?.(dimmed);
    set({ dimmed });
  },
}));

const W = 32;
const H = 24;
/** Diferença por ponto para contar como mudança (0–255), e fração mínima da imagem */
const PIXEL_DIFF = 28;
const SEEN = 0.015;
const NEAR = 0.16;

/** Quanto da imagem mudou entre dois quadros pequenos em tons de cinza (0–1) */
export function changedFraction(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const ga = a[i]! * 0.3 + a[i + 1]! * 0.59 + a[i + 2]! * 0.11;
    const gb = b[i]! * 0.3 + b[i + 1]! * 0.59 + b[i + 2]! * 0.11;
    if (Math.abs(ga - gb) > PIXEL_DIFF) n++;
  }
  return n / (a.length / 4);
}

/**
 * Presença pela câmera do aparelho: compara quadros bem pequenos (32×24) duas vezes por segundo.
 * Nada é gravado nem enviado. Movimento na frente “acorda” a tela; quando alguém chega perto,
 * sai do descanso de tela. Sem movimento por um tempo, escurece a tela (se escolhido nos ajustes).
 */
export function usePresence(enabled: boolean) {
  const wake = useSettings((s) => s.presenceWake);
  const dimAfter = useSettings((s) => s.dimAfter);
  const on = enabled && (wake || dimAfter > 0);

  useEffect(() => {
    const store = usePresenceStore;
    if (!on) {
      store.setState({ status: 'desligado', level: 0 });
      if (store.getState().dimmed) store.getState().setDimmed(false);
      return;
    }
    let alive = true;
    let have = false;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    let bigRun = 0;
    store.setState({ seenAt: Date.now() });

    // Toque na tela também conta como “tem gente aqui”
    const touch = () => {
      store.setState({ seenAt: Date.now() });
      if (store.getState().dimmed) store.getState().setDimmed(false);
    };
    window.addEventListener('pointerdown', touch, { passive: true });

    (async () => {
      let video: HTMLVideoElement;
      try {
        store.setState({ status: 'abrindo a câmera…' });
        video = await acquireCamera();
        have = true;
      } catch (err) {
        store.setState({ status: (err as Error).message });
        return;
      }
      if (!alive) return releaseCamera();
      store.setState({ status: 'olhando' });
      while (alive) {
        if (document.visibilityState === 'visible' && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, W, H);
          const cur = ctx.getImageData(0, 0, W, H).data;
          if (prev) {
            const level = changedFraction(prev, cur);
            const now = Date.now();
            const s = store.getState();
            const patch: Partial<PresenceState> = { level };
            if (level > SEEN) {
              patch.seenAt = now;
              if (s.dimmed) s.setDimmed(false);
            }
            // Dois quadros seguidos com muita mudança = alguém bem na frente da tela
            bigRun = level > NEAR ? bigRun + 1 : 0;
            if (bigRun >= 2 && now - s.nearAt > 3000) patch.nearAt = now;
            store.setState(patch);
          }
          prev = new Uint8ClampedArray(cur);
          const s = store.getState();
          if (dimAfter > 0 && !s.dimmed && Date.now() - s.seenAt > dimAfter * 60_000) s.setDimmed(true);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    })();

    return () => {
      alive = false;
      window.removeEventListener('pointerdown', touch);
      if (have) releaseCamera();
      if (store.getState().dimmed) store.getState().setDimmed(false);
    };
  }, [on, dimAfter]);
}

