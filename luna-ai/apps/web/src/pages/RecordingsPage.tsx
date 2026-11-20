import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Settings } from 'lucide-react';
import type { RecordingDayDto, RecordingFileDto, RecordingsDto } from '@luna/shared/types';
import { Page } from '../components/Layout';
import { Banner, Card, PageHeader, Spinner } from '../components/ui';
import { api, errorMessage } from '../services/api';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (s: number) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`;
const SPEEDS = [1, 2, 4, 8];

function dayLabel(date: string) {
  const d = new Date(`${date}T12:00:00`);
  const today = new Date();
  const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/**
 * Gravações das câmeras: escolhe a câmera e o dia; a grade mostra as 24 horas em blocos de 10 minutos
 * (claros = tem vídeo). Tocar num bloco toca o vídeo, que segue sozinho para o próximo trecho.
 */
export default function RecordingsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<RecordingsDto | null>(null);
  const [days, setDays] = useState<RecordingDayDto[] | null>(null);
  const [files, setFiles] = useState<RecordingFileDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number>(-1);
  const [speed, setSpeed] = useState(1);
  const [pos, setPos] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const seekTo = useRef(0);

  const cams = useMemo(() => (status?.cameras ?? []).filter((c) => c.supported), [status]);
  const cam = params.get('camera') ?? cams.find((c) => c.enabled)?.entityId ?? cams[0]?.entityId ?? null;
  const date = params.get('dia') ?? days?.[0]?.date ?? null;
  const pick = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    if (k === 'camera') next.delete('dia');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    api<RecordingsDto>('/api/recordings').then(setStatus, (e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    if (!cam) return;
    setDays(null);
    setFiles(null);
    setPlaying(-1);
    api<RecordingDayDto[]>(`/api/recordings/${cam}/days`).then(setDays, (e) => setError(errorMessage(e)));
  }, [cam]);
  useEffect(() => {
    if (!cam || !date) return;
    setFiles(null);
    setPlaying(-1);
    api<RecordingFileDto[]>(`/api/recordings/${cam}/days/${date}`).then(setFiles, (e) => setError(errorMessage(e)));
  }, [cam, date]);

  const current = files && playing >= 0 ? files[playing] : null;
  const src = current && cam && date ? `/api/recordings/${cam}/days/${date}/${current.file}` : null;
  useEffect(() => {
    if (video.current) video.current.playbackRate = speed;
  }, [speed, src]);

  /** Toca o trecho que tem o segundo `t` do dia (ou o próximo que tiver vídeo) */
  const playAt = (t: number) => {
    if (!files?.length) return;
    let i = files.findIndex((f) => t >= f.start && t < f.start + f.seconds);
    if (i < 0) i = files.findIndex((f) => f.start >= t);
    if (i < 0) return;
    seekTo.current = Math.max(0, t - files[i]!.start);
    setPlaying(i);
  };

  // Grade de 24 h × 6 blocos de 10 min: quais blocos têm vídeo
  const slots = useMemo(() => {
    const has = new Set<number>();
    for (const f of files ?? []) for (let s = Math.floor(f.start / 600); s * 600 < f.start + f.seconds; s++) has.add(s);
    return has;
  }, [files]);
  const nowSlot = current ? Math.floor((current.start + pos) / 600) : -1;
  const hours = useMemo(() => {
    // da primeira à última hora com vídeo (as horas sem vídeo no meio aparecem vazias)
    const hs = [...slots].map((s) => Math.floor(s / 6));
    if (!hs.length) return [];
    const a = Math.min(...hs);
    const b = Math.max(...hs);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }, [slots]);

  return (
    <Page>
      <PageHeader
        title="Gravações"
        subtitle={status ? `${status.dir} · guarda ${status.keepDays} dias` : 'Vídeos das câmeras'}
        action={
          <button onClick={() => navigate('/configuracoes')} className="rounded-sm border border-cyan-300/25 bg-ink-950/75 p-2 text-cyan-200/80" aria-label="Ajustes da gravação">
            <Settings className="h-4 w-4" />
          </button>
        }
      />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      {!status ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !cams.length ? (
        <Card className="text-sm text-white/70">Nenhuma câmera com vídeo para gravar.</Card>
      ) : (
        <div className="space-y-4">
          {/* Câmeras */}
          <div className="m-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {cams.map((c) => (
              <button key={c.entityId} className={`m-chip shrink-0 ${c.entityId === cam ? 'act' : ''}`} onClick={() => pick('camera', c.entityId)}>
                {c.enabled && <span className={`h-2 w-2 rounded-full ${c.status === 'gravando' ? 'bg-rose-400' : 'bg-white/30'}`} />}
                {c.name}
              </button>
            ))}
          </div>

          {/* Dias */}
          {days === null ? (
            <Spinner />
          ) : !days.length ? (
            <Card className="text-sm text-white/70">{cams.find((c) => c.entityId === cam)?.enabled ? 'Ainda não há gravações desta câmera. O primeiro arquivo aparece em alguns minutos.' : 'Esta câmera não está gravando. Ligue em Ajustes › Gravação das câmeras.'}</Card>
          ) : (
            <div className="m-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {days.map((d) => (
                <button key={d.date} className={`m-chip shrink-0 ${d.date === date ? 'act' : ''}`} onClick={() => pick('dia', d.date)}>
                  {dayLabel(d.date)}
                </button>
              ))}
            </div>
          )}

          <div className={src ? 'gap-4 space-y-4 min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] min-[900px]:items-start min-[900px]:space-y-0' : ''}>
          {/* Vídeo */}
          {src && current && (
            <div className="m-card overflow-hidden p-0" style={{ padding: 0 }}>
              <video
                ref={video}
                key={src}
                src={src}
                className="aspect-video w-full bg-black"
                controls
                autoPlay
                playsInline
                onLoadedMetadata={(e) => {
                  e.currentTarget.playbackRate = speed;
                  if (seekTo.current) e.currentTarget.currentTime = seekTo.current;
                  seekTo.current = 0;
                }}
                onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
                onEnded={() => files && playing < files.length - 1 && setPlaying(playing + 1)}
                onError={() => setError('Este vídeo não toca neste aparelho (talvez a câmera grave em H.265). Use “Baixar” e abra num player como o VLC.')}
              />
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <p className="m-num mr-auto text-lg">
                  {hhmm(current.start + pos)}
                  <span className="m-muted ml-2 text-sm">{dayLabel(date!)}</span>
                </p>
                <button className="m-chip" disabled={playing <= 0} onClick={() => setPlaying(playing - 1)} aria-label="Trecho anterior">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button className="m-chip" disabled={!files || playing >= files.length - 1} onClick={() => setPlaying(playing + 1)} aria-label="Próximo trecho">
                  <ChevronRight className="h-4 w-4" />
                </button>
                {SPEEDS.map((s) => (
                  <button key={s} className={`m-chip ${speed === s ? 'act' : ''}`} style={{ padding: '6px 11px' }} onClick={() => setSpeed(s)}>
                    {s}×
                  </button>
                ))}
                <a className="m-chip" href={`${src}?baixar=1`} download>
                  <Download className="h-4 w-4" /> Baixar
                </a>
              </div>
            </div>
          )}

          {/* Grade do dia */}
          {files === null && date ? (
            <Spinner />
          ) : files && files.length > 0 ? (
            <div className={`m-card space-y-1.5 ${src ? 'min-[900px]:max-h-[70vh] min-[900px]:overflow-y-auto' : ''}`} style={{ padding: 14 }}>
              <p className="m-label mb-2">{current ? 'Toque em outro horário para pular' : 'Toque num horário para assistir'}</p>
              {hours.map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="m-muted w-12 shrink-0 text-right text-sm tabular-nums">{pad(h)}:00</span>
                  <div className="grid flex-1 grid-cols-6 gap-1.5">
                    {[0, 1, 2, 3, 4, 5].map((k) => {
                      const s = h * 6 + k;
                      const on = slots.has(s);
                      return (
                        <button
                          key={k}
                          disabled={!on}
                          onClick={() => playAt(s * 600)}
                          aria-label={`${pad(h)}:${k}0`}
                          className={`h-9 rounded-lg text-[11px] transition ${s === nowSlot ? 'bg-rose-400 text-black' : on ? 'bg-sky-300/35 hover:bg-sky-300/60' : 'bg-white/5'}`}
                        >
                          {on ? `${pad(h)}:${k}0` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          </div>
        </div>
      )}
    </Page>
  );
}
