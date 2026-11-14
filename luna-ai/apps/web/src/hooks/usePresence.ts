import { useEffect } from 'react';
import { create } from 'zustand';
import { acquireCamera, forceCloseCamera, releaseCamera } from '../lib/deviceCamera';
import { nativeApp } from '../lib/native';
import { useSettings } from '../stores/settings';

interface PresenceState {
  /** Última vez que viu movimento na frente da câmera */
  seenAt: number;
  /** Última vez que alguém chegou perto (movimento grande, rosto/corpo perto da tela) */
  nearAt: number;
  /** Quanto da imagem mudou no último quadro (0–1), para conferir nos ajustes */
  level: number;
  /** Claridade que a câmera está vendo (0–255) */
  light: number;
  status: string;
  dimmed: boolean;
  setDimmed: (v: boolean) => void;
  /** Tela apagada pelo app (a câmera está com o vigia do app) */
  sleeping: boolean;
  /** Conta as vezes que a tela voltou (reinicia a presença) */
  wakes: number;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  seenAt: Date.now(),
  nearAt: 0,
  level: 0,
  light: 0,
  status: 'desligado',
  dimmed: false,
  sleeping: false,
  wakes: 0,
  setDimmed: (dimmed) => {
    nativeApp()?.setDim?.(dimmed);
    set({ dimmed });
  },
}));

const W = 32;
const H = 24;
/** Fração mínima da imagem que precisa mudar: alguém na sala / alguém bem na frente */
const SEEN = 0.015;
const NEAR = 0.16;

const gray = (d: Uint8ClampedArray) => {
  const g = new Float32Array(d.length / 4);
  for (let i = 0, k = 0; i < d.length; i += 4, k++) g[k] = d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11;
  return g;
};
const mean = (g: Float32Array) => g.reduce((s, v) => s + v, 0) / g.length;

/** Claridade média da imagem (0–255): perto de 0 = escuro demais para a câmera enxergar */
export const frameLight = (d: Uint8ClampedArray) => mean(gray(d));

/**
 * Quanto da imagem mudou entre dois quadros pequenos (0–1). Funciona também na penumbra (tela
 * apagada, luz baixa): a diferença exigida acompanha a claridade da cena, e a mudança geral de
 * exposição da câmera (tudo clareando ou escurecendo junto) é descontada.
 */
export function changedFraction(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const ga = gray(a);
  const gb = gray(b);
  const ma = mean(ga);
  const mb = mean(gb);
  const limit = Math.min(28, Math.max(6, ((ma + mb) / 2) * 0.3));
  let n = 0;
  for (let k = 0; k < ga.length; k++) if (Math.abs(ga[k]! - ma - (gb[k]! - mb)) > limit) n++;
  return n / ga.length;
}

/**
 * Presença pela câmera do aparelho: compara quadros bem pequenos (32×24) duas vezes por segundo.
 * Nada é gravado nem enviado. Movimento na frente “acorda” a tela; quando alguém chega perto,
 * sai do descanso de tela. Sem movimento por um tempo, escurece a tela (se escolhido nos ajustes).
 */
export function usePresence(enabled: boolean) {
  const wake = useSettings((s) => s.presenceWake);
  const dimAfter = useSettings((s) => s.dimAfter);
  const wakes = usePresenceStore((s) => s.wakes);
  const on = enabled && (wake || dimAfter > 0);

  useEffect(() => {
    const store = usePresenceStore;
    // Tela acesa de novo pelo app (alguém chegou, ou tocaram/ligaram a tela)
    const onWake = () => {
      const now = Date.now();
      store.setState((s) => ({ sleeping: false, wakes: s.wakes + 1, seenAt: now, nearAt: now }));
    };
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
      if (store.getState().sleeping) nativeApp()?.wakeScreen?.();
      store.setState({ seenAt: Date.now() });
      if (store.getState().dimmed) store.getState().setDimmed(false);
    };
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('dia-native-wake', onWake);
    // O app acendeu a tela (toque ou abertura): tira o escurecimento da página também
    const onUndim = () => {
      store.setState({ seenAt: Date.now() });
      if (store.getState().dimmed) store.setState({ dimmed: false });
    };
    window.addEventListener('dia-native-undim', onUndim);

    // No app Android a câmera da presença fica com o próprio app: no navegador interno do Android,
    // abrir a câmera aqui na página deixava a tela inteira preta. A página só recebe o movimento.
    const app = nativeApp();
    if (app?.startPresence) {
      store.setState({ status: 'olhando (pelo app)' });
      app.startPresence();
      const onMotion = (e: Event) => {
        const { level, light } = (e as CustomEvent<{ level: number; light: number }>).detail ?? { level: 0, light: 0 };
        const now = Date.now();
        const s = store.getState();
        const patch: Partial<PresenceState> = { level, light };
        if (level > SEEN) {
          patch.seenAt = now;
          if (s.dimmed) s.setDimmed(false);
        }
        bigRun = level > NEAR ? bigRun + 1 : 0;
        if (bigRun >= 2 && now - s.nearAt > 3000) patch.nearAt = now;
        store.setState(patch);
      };
      window.addEventListener('dia-native-motion', onMotion);
      const timer = setInterval(() => {
        const s = store.getState();
        if (dimAfter > 0 && !s.dimmed && !s.sleeping && Date.now() - s.seenAt > dimAfter * 60_000) {
          // Com a permissão liberada o app apaga a tela de verdade (e acende quando alguém chegar)
          if (app.sleepScreen && app.screenOffReady?.() && app.sleepScreen()) store.setState({ sleeping: true, status: 'tela apagada' });
          else s.setDimmed(true);
        }
      }, 2000);
      return () => {
        window.removeEventListener('dia-native-motion', onMotion);
        clearInterval(timer);
        window.removeEventListener('pointerdown', touch);
        window.removeEventListener('dia-native-wake', onWake);
        window.removeEventListener('dia-native-undim', onUndim);
        app.stopPresence?.();
        if (store.getState().dimmed) store.getState().setDimmed(false);
      };
    }

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
        // O navegador pode pausar o vídeo da câmera para economizar: retoma
        if (video.paused) void video.play().catch(() => undefined);
        if (document.visibilityState === 'visible' && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, W, H);
          const cur = ctx.getImageData(0, 0, W, H).data;
          if (prev) {
            const level = changedFraction(prev, cur);
            const now = Date.now();
            const s = store.getState();
            const patch: Partial<PresenceState> = { level, light: frameLight(cur) };
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
          if (dimAfter > 0 && !s.dimmed && Date.now() - s.seenAt > dimAfter * 60_000) {
            // No app com a permissão liberada: apaga a tela de verdade e o app vigia com a câmera
            const app = nativeApp();
            if (app?.sleepScreen && app.screenOffReady?.()) {
              forceCloseCamera();
              have = false;
              store.setState({ sleeping: true, status: 'tela apagada' });
              await new Promise((r) => setTimeout(r, 300));
              if (app.sleepScreen()) return; // o app acende e avisa (“dia-native-wake”), e a presença recomeça
              // Não deu para apagar: volta a olhar com a câmera e só escurece
              store.setState({ sleeping: false });
              try {
                video = await acquireCamera();
                have = true;
              } catch {
                return;
              }
              s.setDimmed(true);
            } else s.setDimmed(true);
          }
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    })();

    return () => {
      alive = false;
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('dia-native-wake', onWake);
      window.removeEventListener('dia-native-undim', onUndim);
      if (have) releaseCamera();
      if (store.getState().dimmed) store.getState().setDimmed(false);
    };
  }, [on, dimAfter, wakes]);
}

