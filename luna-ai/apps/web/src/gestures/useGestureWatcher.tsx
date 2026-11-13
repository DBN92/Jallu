import { useEffect } from 'react';
import { create } from 'zustand';
import type { GestureRuleDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useSettings } from '../stores/settings';
import { GestureStabilizer, SENSITIVITY } from './stabilizer';
import { cameraFrame, HandTracker, loadRecognizer } from './recognizer';
import { acquireCamera, releaseCamera } from '../lib/deviceCamera';

interface GestureToastState {
  toast: { text: string; ok: boolean; at: number } | null;
  status: string;
  show: (text: string, ok?: boolean) => void;
  setStatus: (s: string) => void;
}

/** Aviso “✋ Luz da Sala ligada” e o estado do analisador (mostrado em Ajustes). */
export const useGestureToast = create<GestureToastState>((set) => ({
  toast: null,
  status: 'desligado',
  show: (text, ok = true) => set({ toast: { text, ok, at: Date.now() } }),
  setStatus: (status) => set({ status }),
}));

const INTERVAL_MS = 250; // ~4 análises por segundo por câmera

/**
 * Analisa gestos neste aparelho (ligado em Ajustes › Gestos): olha só as câmeras que têm regras
 * e, se houver regra para “câmera do aparelho”, a câmera frontal. Ao reconhecer um gesto mantido,
 * pede ao servidor para executar as regras.
 */
export function useGestureWatcher(enabled: boolean) {
  const on = useSettings((s) => s.gestureWatch) && enabled;
  const sensitivity = useSettings((s) => s.gestureSensitivity);

  useEffect(() => {
    if (!on) {
      useGestureToast.getState().setStatus('desligado');
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    let sources: string[] = [];
    let video: HTMLVideoElement | null = null;
    let cameraTried = false;
    const stabilizers = new Map<string, GestureStabilizer>();
    const trackers = new Map<string, HandTracker>();
    const status = useGestureToast.getState().setStatus;

    const loadRules = async () => {
      try {
        const r = await api<{ rules: GestureRuleDto[]; sources: string[] }>('/api/gestures');
        sources = r.sources;
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    };

    const ensureDeviceCamera = async () => {
      // A câmera foi fechada (tela apagada pelo app): pede de novo
      if (video && !(video.srcObject as MediaStream | null)?.active) {
        video = null;
        cameraTried = false;
      }
      if (video || cameraTried || !sources.includes('device')) return;
      cameraTried = true; // câmera compartilhada com a presença e os recados
      try {
        const v = await acquireCamera();
        if (!alive) return releaseCamera();
        video = v;
      } catch (err) {
        status(`sem acesso à câmera do aparelho: ${errorMessage(err)}`);
      }
    };

    const fire = async (gesture: string, source: string) => {
      try {
        const r = await api<{ emoji: string; results: { ok: boolean; summary: string }[] }>('/api/gestures/fire', { body: { gesture, source } });
        for (const x of r.results) useGestureToast.getState().show(`${r.emoji} ${x.summary}`, x.ok);
      } catch (err) {
        useGestureToast.getState().show(errorMessage(err), false);
      }
    };

    (async () => {
      await loadRules();
      const rulesTimer = setInterval(() => void loadRules(), 60_000);
      ctrl.signal.addEventListener('abort', () => clearInterval(rulesTimer));
      try {
        status('carregando o reconhecedor…');
        await loadRecognizer(); // pré-carrega o modelo
      } catch (err) {
        status(errorMessage(err));
        return;
      }
      while (alive) {
        const started = Date.now();
        if (document.visibilityState !== 'visible' || !sources.length) {
          status(sources.length ? 'pausado (tela oculta)' : 'sem regras de gestos');
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        await ensureDeviceCamera();
        status(`analisando ${sources.length} ${sources.length === 1 ? 'câmera' : 'câmeras'}`);
        for (const src of sources) {
          if (!alive) break;
          try {
            let img: TexImageSource | ImageBitmap | null = null;
            if (src === 'device') {
              const v = video as HTMLVideoElement | null; // preenchido em ensureDeviceCamera
              img = v && v.readyState >= 2 ? v : null;
            }
            else img = await cameraFrame(src, ctrl.signal);
            if (!img) continue;
            let tr = trackers.get(src);
            if (!tr) trackers.set(src, (tr = new HandTracker()));
            const d = await tr.analyze(img);
            if (img instanceof ImageBitmap) img.close();
            let st = stabilizers.get(src);
            if (!st) stabilizers.set(src, (st = new GestureStabilizer(SENSITIVITY[sensitivity])));
            const g = st.push(d.gesture, d.score, Date.now());
            if (g) void fire(g, src);
          } catch {
            /* câmera sem imagem agora: segue para a próxima */
          }
        }
        await new Promise((r) => setTimeout(r, Math.max(50, INTERVAL_MS - (Date.now() - started))));
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
      if (video) releaseCamera();
    };
  }, [on, sensitivity]);
}

/** Aviso flutuante quando um gesto aciona algo. */
export function GestureToast() {
  const toast = useGestureToast((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useGestureToast.setState({ toast: null }), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div
      role="status"
      className={`font-hud pointer-events-none fixed top-[calc(env(safe-area-inset-top)+12px)] left-1/2 z-[90] -translate-x-1/2 rounded-sm border px-4 py-2 text-base shadow-[0_0_24px_rgba(0,229,255,0.35)] ${toast.ok ? 'border-cyan-300/60 bg-ink-950/90 text-cyan-50' : 'border-rose-400/60 bg-rose-950/90 text-rose-100'}`}
    >
      {toast.text}
    </div>
  );
}
