import { useEffect, useRef, useState } from 'react';
import type { CameraDto } from '@luna/shared/types';
import { api, ApiError } from '../services/api';
import { Spinner } from './ui';

type Mode = 'loading' | 'live' | 'images' | 'error';

/**
 * Vídeo ao vivo da câmera. Tenta HLS (Safari nativo / hls.js no Android e computador);
 * se a câmera ou o HA não oferecerem vídeo contínuo, mostra imagens atualizadas a cada segundo.
 */
export function CameraPlayer({ camera, className = '' }: { camera: CameraDto; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('loading');
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const snapFailed = useRef(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    setMode('loading');
    setMessage(null);

    const fallback = (msg?: string) => {
      if (cancelled) return;
      if (msg) setMessage(msg);
      setMode('images');
    };

    (async () => {
      if (!camera.stream) return fallback();
      try {
        const { url } = await api<{ url: string }>(`/api/cameras/${camera.entityId}/stream`, { method: 'POST' });
        const el = video.current;
        if (cancelled || !el) return;
        if (el.canPlayType('application/vnd.apple.mpegurl')) {
          el.src = url;
        } else {
          const { default: Hls } = await import('hls.js');
          if (!Hls.isSupported()) return fallback('Este navegador não toca vídeo ao vivo; mostrando imagens.');
          const h = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, maxBufferLength: 6 });
          hls = h;
          h.on(Hls.Events.ERROR, (_e, data) => data.fatal && fallback('O vídeo ao vivo falhou; mostrando imagens.'));
          h.loadSource(url);
          h.attachMedia(el);
        }
        el.onplaying = () => !cancelled && setMode('live');
        el.onerror = () => fallback('O vídeo ao vivo falhou; mostrando imagens.');
        // O tempo limite começa ANTES de play(): no iPhone, play() pode ficar esperando para sempre
        setTimeout(() => !cancelled && el.readyState < 2 && fallback('O vídeo ao vivo não começou em 15 s; mostrando imagens.'), 15_000);
        void el.play().catch(() => undefined);
      } catch (err) {
        fallback(err instanceof ApiError && err.status !== 409 ? err.message : undefined);
      }
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
      if (video.current) {
        video.current.removeAttribute('src');
        video.current.load();
      }
    };
  }, [camera.entityId, camera.stream]);

  // Modo imagens: atualiza a foto ~1x por segundo (só com a aba visível)
  useEffect(() => {
    if (mode !== 'images') return;
    const t = setInterval(() => document.visibilityState === 'visible' && setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [mode]);

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video ref={video} className={`h-full w-full object-contain ${mode === 'live' || mode === 'loading' ? '' : 'hidden'}`} muted playsInline autoPlay />
      {mode === 'images' && (
        <img
          src={`/api/cameras/${camera.entityId}/snapshot?t=${tick}`}
          alt=""
          className={`h-full w-full object-contain ${broken ? 'invisible' : ''}`}
          onError={() => {
            setBroken(true);
            if (snapFailed.current) return;
            snapFailed.current = true;
            api<{ steps: { step: string; ok: boolean; detail: string }[] }>(`/api/cameras/${camera.entityId}/diagnose`)
              .then((d) => {
                const bad = d.steps.find((st) => !st.ok);
                setMessage(bad ? `${bad.step}: ${bad.detail}` : 'A câmera não respondeu agora.');
              })
              .catch(() => setMessage('A câmera não respondeu. Ela está ligada e na rede?'));
          }}
          onLoad={() => {
            setBroken(false);
            // Só limpa o aviso se ele era de falha na foto (mantém o motivo da troca para imagens)
            if (snapFailed.current) setMessage(null);
            snapFailed.current = false;
          }}
        />
      )}
      {mode === 'images' && broken && (
        <div className="font-hud absolute inset-0 grid place-items-center px-6 text-center text-sm text-cyan-100/60">Sem imagem da câmera no momento — tentando de novo…</div>
      )}
      {mode === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-cyan-200">
          <Spinner className="h-7 w-7" />
        </div>
      )}
      <span
        className={`hud-label absolute top-2 left-2 rounded-sm px-2 py-1 text-[9px] ${mode === 'live' ? 'bg-rose-600/85 text-white' : 'bg-ink-950/80 text-cyan-200'}`}
      >
        {mode === 'live' ? '● ao vivo' : mode === 'images' ? 'imagens · 1 por segundo' : 'conectando…'}
      </span>
      {message && <p className="font-hud absolute inset-x-2 bottom-2 rounded-sm bg-ink-950/85 px-2 py-1 text-center text-xs text-amber-100">{message}</p>}
    </div>
  );
}

/** Miniatura que se atualiza a cada `everyMs` (economiza dados). */
export function CameraThumb({ camera, everyMs = 8000, className = '' }: { camera: CameraDto; everyMs?: number; className?: string }) {
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && setTick((n) => n + 1), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      {failed && !camera.available ? (
        <div className="font-hud grid h-full place-items-center text-xs text-cyan-100/50">câmera offline</div>
      ) : (
        <img
          src={`/api/cameras/${camera.entityId}/snapshot?t=${tick}`}
          alt={camera.name}
          className="h-full w-full object-cover"
          onLoad={() => setFailed(false)}
          onError={() => setFailed(true)}
          loading="lazy"
        />
      )}
    </div>
  );
}
