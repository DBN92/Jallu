import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Maximize, Stethoscope, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { CameraDto, PtzAction } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useCameras } from '../stores/cameras';
import { CameraPlayer, CameraThumb } from './CameraPlayer';

/** Botão de movimento: segura para mover, solta para parar. */
function PtzButton({ camera, action, label, children, onError }: { camera: CameraDto; action: PtzAction; label: string; children: React.ReactNode; onError: (m: string) => void }) {
  const send = (a: PtzAction) => api(`/api/cameras/${camera.entityId}/ptz`, { body: { action: a } }).catch((e) => onError(errorMessage(e)));
  const moving = useRef(false);
  return (
    <button
      aria-label={label}
      className="grid h-12 w-12 place-items-center rounded-full border border-cyan-300/40 bg-ink-900/80 text-cyan-100 shadow-[0_0_10px_rgba(0,229,255,0.2)] active:scale-95 active:border-cyan-300 active:bg-cyan-400/20"
      onPointerDown={(e) => {
        e.preventDefault();
        moving.current = true;
        void send(action);
      }}
      onPointerUp={() => moving.current && ((moving.current = false), void send('stop'))}
      onPointerLeave={() => moving.current && ((moving.current = false), void send('stop'))}
    >
      {children}
    </button>
  );
}

/** Testa cada etapa (HA, foto, vídeo) e mostra onde falha. */
function Diagnose({ camera }: { camera: CameraDto }) {
  const [steps, setSteps] = useState<{ step: string; ok: boolean; detail: string; ms?: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      setSteps((await api<{ steps: { step: string; ok: boolean; detail: string; ms?: number }[] }>(`/api/cameras/${camera.entityId}/diagnose`)).steps);
    } catch (e) {
      setSteps([{ step: 'Diagnóstico', ok: false, detail: errorMessage(e) }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="text-center">
      <button onClick={() => void run()} disabled={busy} className="hud-label inline-flex items-center gap-1.5 text-cyan-300/70 hover:text-cyan-200 disabled:opacity-50">
        <Stethoscope className="h-3.5 w-3.5" /> {busy ? 'testando…' : 'diagnóstico'}
      </button>
      {steps && (
        <ul className="font-hud mt-2 space-y-1 text-left text-xs">
          {steps.map((s) => (
            <li key={s.step} className={s.ok ? 'text-emerald-300' : 'text-rose-300'}>
              {s.ok ? '✓' : '✗'} <b>{s.step}</b>
              {s.ms !== undefined ? ` (${(s.ms / 1000).toFixed(1)} s)` : ''}: <span className="text-cyan-100/70">{s.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Controles da câmera: movimento (ONVIF), zoom, foto e tela cheia. */
export function CameraControls({ camera, containerRef }: { camera: CameraDto; containerRef: React.RefObject<HTMLElement | null> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-4">
        {camera.ptz && (
          <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
            <span />
            <PtzButton camera={camera} action="up" label="Inclinar para cima" onError={setError}><ChevronUp className="h-6 w-6" /></PtzButton>
            <span />
            <PtzButton camera={camera} action="left" label="Girar para a esquerda" onError={setError}><ChevronLeft className="h-6 w-6" /></PtzButton>
            <span className="grid place-items-center"><span className="h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_10px_#00e5ff]" /></span>
            <PtzButton camera={camera} action="right" label="Girar para a direita" onError={setError}><ChevronRight className="h-6 w-6" /></PtzButton>
            <span />
            <PtzButton camera={camera} action="down" label="Inclinar para baixo" onError={setError}><ChevronDown className="h-6 w-6" /></PtzButton>
            <span />
          </div>
        )}
        <div className="flex flex-col gap-2">
          {camera.ptz && (
            <div className="flex gap-2">
              <PtzButton camera={camera} action="zoom_in" label="Aproximar" onError={setError}><ZoomIn className="h-5 w-5" /></PtzButton>
              <PtzButton camera={camera} action="zoom_out" label="Afastar" onError={setError}><ZoomOut className="h-5 w-5" /></PtzButton>
            </div>
          )}
          <div className="flex gap-2">
            <a
              href={`/api/cameras/${camera.entityId}/snapshot`}
              download={`${camera.name}-${new Date().toISOString().slice(0, 19)}.jpg`}
              aria-label="Salvar foto"
              className="grid h-12 w-12 place-items-center rounded-full border border-cyan-300/40 bg-ink-900/80 text-cyan-100"
            >
              <Camera className="h-5 w-5" />
            </a>
            <button
              aria-label="Tela cheia"
              onClick={() => void containerRef.current?.requestFullscreen?.().catch(() => undefined)}
              className="grid h-12 w-12 place-items-center rounded-full border border-cyan-300/40 bg-ink-900/80 text-cyan-100"
            >
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      <Diagnose camera={camera} />
      {!camera.ptz && (
        <p className="font-hud text-center text-xs text-cyan-100/45">
          {camera.platform === 'luna'
            ? 'Para girar/inclinar: Ajustes › Câmeras diretas › Ativar movimento.'
            : 'Para girar/inclinar, adicione esta câmera ao Home Assistant pela integração ONVIF.'}
        </p>
      )}
      {error && <p className="font-hud text-center text-xs text-rose-300">{error}</p>}
    </div>
  );
}

/** Visualizador em tela cheia (aberto pela aba Câmeras, painel da tela inicial ou por voz). */
export function CameraViewer() {
  const { viewing, cameras, close, load } = useCameras();
  const [current, setCurrent] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewing && !cameras) void load();
    if (viewing) setCurrent(viewing[0] ?? null);
  }, [viewing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing, close]);

  if (!viewing) return null;
  const list = (cameras ?? []).filter((c) => viewing.includes(c.entityId));
  const cam = list.find((c) => c.entityId === current) ?? list[0];

  return createPortal(
    <div className="overlay-full focus-in z-[67] flex flex-col bg-ink-950/96 px-3 pt-safe pb-safe">
      <header className="flex items-center justify-between gap-3 py-2">
        <div>
          <p className="hud-label">câmera</p>
          <h2 className="hud-title hud-glow text-lg font-bold text-cyan-50 uppercase">{cam?.name ?? 'Carregando…'}</h2>
        </div>
        <button onClick={close} className="rounded-sm border border-cyan-300/30 bg-ink-900/70 p-2.5 text-cyan-100/80" aria-label="Fechar câmera">
          <X className="h-5 w-5" />
        </button>
      </header>
      {cam ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <div ref={box} className="hud-panel min-h-0 flex-1 p-1.5">
            <CameraPlayer key={cam.entityId} camera={cam} className="h-full min-h-[220px] w-full" />
          </div>
          <div className="flex shrink-0 flex-col gap-3 md:w-64">
            <CameraControls camera={cam} containerRef={box} />
            {list.length > 1 && (
              <div className="grid grid-cols-3 gap-2 md:grid-cols-2">
                {list.map((c) => (
                  <button key={c.entityId} onClick={() => setCurrent(c.entityId)} className={`overflow-hidden rounded-sm border ${c.entityId === cam.entityId ? 'border-cyan-300' : 'border-cyan-300/20'}`}>
                    <CameraThumb camera={c} className="aspect-video" />
                    <p className="font-hud truncate px-1 py-0.5 text-[10px] text-cyan-100/70">{c.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="font-hud mt-8 text-center text-cyan-100/60">{cameras ? 'Câmera não encontrada.' : 'Carregando câmeras…'}</p>
      )}
    </div>,
    document.body,
  );
}
