import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkCheck, ChevronRight, Circle, RotateCcw, Send, Square, Trash2, Video, X } from 'lucide-react';
import { acquireCamera, cameraTrack, releaseCamera } from '../lib/deviceCamera';
import { nativeApp } from '../lib/native';
import { errorMessage } from '../services/api';
import { unseenRecados, useRecados } from '../stores/recados';

/** Recados têm no máximo 30 segundos */
const MAX_S = 30;
const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

function pickMime() {
  const opts = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return opts.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

/** Abre o microfone tentando de novo por até ~6 s enquanto outro uso (a escuta do “Oi, Luna”) o solta */
async function openMic(alive: () => boolean): Promise<MediaStream> {
  let last: unknown;
  for (let i = 0; i < 15 && alive(); i++) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch (err) {
      last = err;
      const name = (err as DOMException)?.name;
      // Permissão negada não melhora esperando
      if (name === 'NotAllowedError' || name === 'SecurityError') break;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  const name = (last as DOMException)?.name;
  throw new Error(
    name === 'NotAllowedError'
      ? 'O microfone não foi permitido para a Luna. Libere nas permissões do app.'
      : 'O microfone está ocupado por outro app. Feche-o (ou pause a escuta do “Oi, Luna”) e tente de novo.',
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="overlay-full z-[80] flex flex-col items-center justify-center bg-ink-950/96 px-4 pt-safe pb-safe">
      <div className="flex w-full max-w-2xl items-center justify-between py-3">
        <p className="hud-label text-sm">{title}</p>
        <button className="m-iconbox" style={{ width: 40, height: 40 }} onClick={onClose} aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 pb-4">{children}</div>
    </div>,
    document.body,
  );
}

/** Gravar um recado com a câmera e o microfone deste aparelho. */
function Recorder() {
  const { close, upload } = useRecados();
  const live = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<'opening' | 'ready' | 'recording' | 'review' | 'sending'>('opening');
  const [error, setError] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [camOn, setCamOn] = useState(false);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    let alive = true;
    let haveCam = false;
    (async () => {
      try {
        await acquireCamera();
        haveCam = true;
        // Mostra a câmera logo, enquanto o microfone é liberado
        const track = cameraTrack();
        if (live.current && track) {
          live.current.srcObject = new MediaStream([track]);
          await live.current.play().catch(() => undefined);
          setCamOn(true);
        }
        // O “Oi, Luna” do app usa o microfone: pausa e espera ele soltar (pode levar uns segundos)
        nativeApp()?.pauseWake?.(true);
        const a = await openMic(() => alive);
        if (!alive) return a.getTracks().forEach((t) => t.stop());
        mic.current = a;
        setPhase('ready');
      } catch (err) {
        if (alive) setError(errorMessage(err));
      }
    })();
    return () => {
      alive = false;
      rec.current?.state === 'recording' && rec.current.stop();
      mic.current?.getTracks().forEach((t) => t.stop());
      if (haveCam) releaseCamera();
      nativeApp()?.pauseWake?.(false);
    };
  }, []);

  useEffect(() => () => {
    if (clip) URL.revokeObjectURL(clip.url);
  }, [clip]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSecs(s);
      if (s >= MAX_S) rec.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [phase]);

  const start = () => {
    const v = cameraTrack();
    const a = mic.current?.getAudioTracks()[0];
    if (!v || !a) return setError('Câmera ou microfone indisponível.');
    const mime = pickMime();
    const r = new MediaRecorder(new MediaStream([v, a]), { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 64_000 });
    const parts: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && parts.push(e.data);
    r.onstop = () => {
      const blob = new Blob(parts, { type: r.mimeType || mime || 'video/webm' });
      setClip({ blob, url: URL.createObjectURL(blob) });
      setPhase('review');
    };
    rec.current = r;
    r.start(1000);
    setSecs(0);
    setPhase('recording');
  };

  const send = async () => {
    if (!clip) return;
    setPhase('sending');
    const err = await upload(clip.blob);
    if (err) {
      setError(err);
      setPhase('review');
    } else close();
  };

  return (
    <Shell title="Gravar recado" onClose={close}>
      <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-black">
        <video ref={live} muted playsInline className={`h-full w-full -scale-x-100 object-cover ${phase === 'review' || phase === 'sending' ? 'hidden' : ''}`} />
        {clip && (phase === 'review' || phase === 'sending') && <video src={clip.url} controls autoPlay playsInline className="h-full w-full object-contain" />}
        {phase === 'recording' && (
          <span className="font-hud absolute top-2 left-2 flex items-center gap-1.5 rounded-sm bg-black/60 px-2 py-1 text-sm text-rose-200">
            <Circle className="h-3 w-3 animate-pulse fill-rose-500 text-rose-500" /> {secs}s de {MAX_S}s
          </span>
        )}
        {phase === 'opening' && !error && (
          <p className={`font-hud absolute ${camOn ? 'bottom-2 left-2 rounded-sm bg-black/60 px-2 py-1' : 'inset-0 grid place-items-center'} text-sm text-cyan-100/80`}>{camOn ? 'liberando o microfone…' : 'abrindo a câmera…'}</p>
        )}
      </div>
      {error && <p className="text-center text-sm text-rose-200">{error}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {phase === 'ready' && (
          <button className="m-chip act" style={{ padding: '12px 22px', fontSize: 16 }} onClick={start}>
            <Circle className="h-4 w-4 fill-current" /> Gravar
          </button>
        )}
        {phase === 'recording' && (
          <button className="m-chip act" style={{ padding: '12px 22px', fontSize: 16 }} onClick={() => rec.current?.stop()}>
            <Square className="h-4 w-4" /> Parar
          </button>
        )}
        {(phase === 'review' || phase === 'sending') && (
          <>
            <button className="m-chip act" style={{ padding: '12px 22px', fontSize: 16 }} disabled={phase === 'sending'} onClick={() => void send()}>
              <Send className="h-4 w-4" /> {phase === 'sending' ? 'Enviando…' : 'Deixar recado'}
            </button>
            <button className="m-chip" style={{ padding: '12px 18px', fontSize: 15 }} disabled={phase === 'sending'} onClick={() => { setClip(null); setError(null); setPhase('ready'); }}>
              <RotateCcw className="h-4 w-4" /> Gravar de novo
            </button>
          </>
        )}
      </div>
      <p className="max-w-md text-center text-xs text-white/45">O recado fica guardado só no servidor da sua casa, aparece para quem chegar e some sozinho depois de 7 dias.</p>
    </Shell>
  );
}

/** Assistir aos recados (os novos primeiro). Ver um recado marca como visto. */
function Player() {
  const { list, close, seen, save, remove } = useRecados();
  const [ended, setEnded] = useState(false);
  const fresh = unseenRecados(list);
  const [order] = useState(() => [...fresh, ...(list ?? []).filter((r) => r.seen)].map((r) => r.id));
  const [i, setI] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const items = order.map((id) => list?.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  const cur = items[Math.min(i, items.length - 1)];

  useEffect(() => {
    if (cur && !cur.seen) void seen(cur.id);
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur)
    return (
      <Shell title="Recados" onClose={close}>
        <p className="text-white/60">Nenhum recado guardado.</p>
        <button className="m-chip act" onClick={() => useRecados.getState().open('recorder')}>
          <Video className="h-4 w-4" /> Gravar um recado
        </button>
      </Shell>
    );
  // Depois de ouvir: salvar (fica guardado) ou descartar (apaga). Depois segue para o próximo.
  const decide = async (keep: boolean) => {
    setError(null);
    const err = keep ? await save(cur.id) : await remove(cur.id);
    if (err) return setError(err);
    setEnded(false);
    const left = items.filter((r) => r.id !== cur.id || keep);
    if (keep && i < items.length - 1) setI(i + 1);
    else if (!keep && left.length && i < left.length) setI(i);
    else close();
  };
  return (
    <Shell title={`Recado de ${cur.fromName} · ${when(cur.createdAt)}${cur.saved ? ' · salvo' : ''}`} onClose={close}>
      <video key={cur.id} src={`/api/recados/${cur.id}/video`} controls autoPlay playsInline onEnded={() => setEnded(true)} onPlay={() => setEnded(false)} className="aspect-video w-full rounded-sm bg-black object-contain" />
      {error && <p className="text-sm text-rose-200">{error}</p>}
      {!cur.saved && (
        <div className={`flex w-full flex-col items-center gap-2 rounded-sm p-3 ${ended ? 'border border-cyan-300/40 bg-cyan-400/10' : ''}`}>
          {ended && <p className="text-sm text-cyan-50">O que fazer com este recado?</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <button className="m-chip act" style={{ padding: '12px 22px', fontSize: 16 }} onClick={() => void decide(true)}>
              <BookmarkCheck className="h-4 w-4" /> Salvar
            </button>
            <button className="m-chip" style={{ padding: '12px 22px', fontSize: 16 }} onClick={() => void decide(false)}>
              <Trash2 className="h-4 w-4" /> Descartar
            </button>
          </div>
          {!ended && <p className="text-xs text-white/45">Sem escolher, o recado some sozinho depois de 7 dias.</p>}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {i < items.length - 1 && (
          <button className="m-chip" onClick={() => { setEnded(false); setI(i + 1); }}>
            Próximo ({items.length - i - 1}) <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {cur.saved && (
          <button
            className="m-chip"
            onClick={async () => {
              if (window.confirm(`Apagar o recado salvo de ${cur.fromName}?`)) await decide(false);
            }}
          >
            <Trash2 className="h-4 w-4" /> Apagar
          </button>
        )}
        <button className="m-chip" onClick={() => useRecados.getState().open('recorder')}>
          <Video className="h-4 w-4" /> Responder com recado
        </button>
      </div>
    </Shell>
  );
}

/** Botão fixo na tela inicial para deixar um recado (com o número de recados novos) */
export function RecadoButton() {
  const list = useRecados((s) => s.list);
  const open = useRecados((s) => s.open);
  const fresh = unseenRecados(list).length;
  const view = useRecados((s) => s.view);
  if (view) return null;
  return createPortal(
    <button
      onClick={() => open(fresh ? 'player' : 'recorder')}
      className="recado-fab fixed right-4 z-[45] flex items-center gap-2 rounded-full border border-cyan-300/50 bg-ink-950/85 p-3.5 sm:px-4 sm:py-3 text-sm font-semibold text-cyan-50 shadow-[0_0_18px_rgba(0,229,255,0.35)] backdrop-blur md:right-6"
      style={{ bottom: 'calc(var(--dock-h, 88px) + 14px)' }}
      aria-label={fresh ? `Ver ${fresh} recado(s) novo(s)` : 'Deixar recado'}
    >
      <span className="relative">
        <Video className="h-5 w-5" />
        {fresh > 0 && <span className="absolute -top-2 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-black">{fresh}</span>}
      </span>
      <span className="max-sm:sr-only">{fresh ? (fresh === 1 ? 'Ver recado' : 'Ver recados') : 'Deixar recado'}</span>
    </button>,
    document.body,
  );
}

/** Telas de recado (montadas uma vez no app) */
export function RecadosLayer() {
  const view = useRecados((s) => s.view);
  if (view === 'recorder') return <Recorder />;
  if (view === 'player') return <Player />;
  return null;
}

/** Atalhos da tela inicial para ver os recados (gravar fica no botão fixo) */
export function RecadosChips({ chipClass = 'm-chip' }: { chipClass?: string }) {
  const list = useRecados((s) => s.list);
  const open = useRecados((s) => s.open);
  const fresh = unseenRecados(list);
  return (
    <>
      {fresh.length > 0 && (
        <button className={`${chipClass} act`} onClick={() => open('player')}>
          <Video className="h-4 w-4" /> {fresh.length === 1 ? `Recado de ${fresh[0]!.fromName}` : `${fresh.length} recados novos`}
        </button>
      )}
      {fresh.length === 0 && !!list?.length && (
        <button className={chipClass} onClick={() => open('player')}>
          Recados ({list.length})
        </button>
      )}
    </>
  );
}
