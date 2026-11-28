import { useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCameras } from '../stores/cameras';
import { eventEmoji, useWatches } from '../stores/watches';
import { CameraThumb } from './CameraPlayer';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  if (m < 24 * 60) return `há ${Math.round(m / 60)} h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

/** Cartão “Garagem” da tela inicial: estado do carro e do portão, câmera e últimos acontecimentos. */
export function GarageCard() {
  const navigate = useNavigate();
  const { watches, events, load, loadEvents } = useWatches();
  const cameras = useCameras((s) => s.cameras);
  const open = useCameras((s) => s.open);

  useEffect(() => {
    void load();
    void loadEvents();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load, loadEvents]);

  const states = (watches ?? []).filter((w) => w.enabled && w.kind !== 'motion');
  if (!watches?.length) return null;
  const cameraId = watches[0]!.cameraId;
  const cam = cameras?.find((c) => c.entityId === cameraId);
  const recent = events.filter((e) => watches.some((w) => w.cameraId === e.cameraId)).slice(0, 3);

  return (
    <div className="m-card" style={{ padding: 16 }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="m-label">Garagem</p>
        <button className="m-muted flex items-center text-xs" onClick={() => navigate('/configuracoes#garagem')}>
          ajustar <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-3">
        {cam && (
          <button onClick={() => open([cam.entityId])} className="relative w-[42%] shrink-0 overflow-hidden" style={{ borderRadius: 16 }} aria-label={`Ver câmera ${cam.name}`}>
            <CameraThumb camera={cam} everyMs={15_000} className="aspect-video w-full" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          {states.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-sm">
                {w.kind === 'car' ? '🚗' : w.kind === 'gate' ? '🚪' : '📷'} {w.name}
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  w.state === null ? 'bg-white/10 text-white/60' : (w.kind === 'gate' && w.state === 'b') ? 'bg-amber-400/20 text-amber-200' : 'bg-emerald-400/15 text-emerald-200'
                }`}
              >
                {w.stateLabel ?? (w.refs.length ? 'lendo…' : 'configurar')}
              </span>
            </div>
          ))}
        </div>
      </div>
      {recent.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate">
                {eventEmoji(e)} {e.title}
              </span>
              <span className="m-muted shrink-0 text-xs">{ago(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
