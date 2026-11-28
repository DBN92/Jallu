import { useEffect, useRef, useState } from 'react';
import { Camera, Crosshair, Eye, Trash2, X } from 'lucide-react';
import type { WatchDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useCameras } from '../stores/cameras';
import { useDevices } from '../stores/devices';
import { useWatches } from '../stores/watches';
import { Button, Toggle } from './ui';

type Zone = { x: number; y: number; w: number; h: number };
const selectClass = 'w-full rounded-sm border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white';
const KINDS: { kind: WatchDto['kind']; label: string; hint: string }[] = [
  { kind: 'car', label: '🚗 Carro', hint: 'na garagem / fora' },
  { kind: 'gate', label: '🚪 Portão', hint: 'fechado / aberto' },
  { kind: 'motion', label: '👀 Movimento à noite', hint: 'avisa mudanças das 18h às 6h' },
];

/**
 * Ajustes › Garagem: vigias por foto de referência. Para cada coisa (carro, portão) o usuário marca
 * a área na imagem e salva fotos dos dois estados; a Luna compara a cada 15 s.
 */
export function GarageSettings() {
  const { watches, load } = useWatches();
  const { cameras, load: loadCameras } = useCameras();
  const [cameraId, setCameraId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    if (!cameras) void loadCameras();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cams = cameras ?? [];
  const cam = cameraId || watches?.[0]?.cameraId || cams.find((c) => /garag/i.test(c.name))?.entityId || cams[0]?.entityId || '';

  const add = async (kind: WatchDto['kind']) => {
    setError(null);
    try {
      await api('/api/watches', { body: { kind, cameraId: cam } });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-3 px-4 py-3" id="garagem">
      <p className="text-xs text-white/45">
        A Luna olha a câmera a cada 15 s e compara com fotos que você salva aqui (ex.: garagem <b>com</b> e <b>sem</b> carro). Avisa quando muda, guarda a foto do momento por 7 dias e pode acender a luz à
        noite. Tudo processado no seu servidor.
      </p>
      <label className="block text-xs text-white/50">
        Câmera
        <select className={selectClass} value={cam} onChange={(e) => setCameraId(e.target.value)}>
          {cams.map((c) => (
            <option key={c.entityId} value={c.entityId}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Button key={k.kind} variant="ghost" onClick={() => void add(k.kind)} disabled={!cam || !!watches?.some((w) => w.cameraId === cam && w.kind === k.kind)}>
            + {k.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {watches?.filter((w) => w.cameraId === cam).map((w) => <WatchEditor key={w.id} watch={w} onChange={load} />)}
    </div>
  );
}

function WatchEditor({ watch: w, onChange }: { watch: WatchDto; onChange: () => Promise<void> }) {
  const devices = useDevices((s) => s.devices);
  const lights = Object.values(devices).filter((d) => d.domain === 'light' || d.category === 'lighting' || d.category === 'switches');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [zoneOpen, setZoneOpen] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api(`/api/watches/${w.id}`, { method: 'PATCH', body });
      await onChange();
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };
  const capture = async (state: 'a' | 'b') => {
    setBusy(state);
    setMsg(null);
    try {
      await api(`/api/watches/${w.id}/refs`, { body: { state } });
      await onChange();
      setMsg({ ok: true, text: `Foto de “${state === 'a' ? w.labelA : w.labelB}” salva.` });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy('test');
    try {
      const r = await api<{ ready: boolean; label: string | null; confidence: number; detail: string | null }>(`/api/watches/${w.id}/check`);
      setMsg(r.ready ? { ok: !r.detail, text: `Agora: ${r.label} (certeza ${Math.round(r.confidence * 100)}%)${r.detail ? ` — ${r.detail}` : ''}` } : { ok: false, text: r.detail ?? 'Sem referência.' });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const refs = (s: 'a' | 'b') => w.refs.filter((r) => r.state === s);
  const motion = w.kind === 'motion';

  return (
    <div className={`space-y-3 rounded-sm border border-white/10 p-3 ${w.enabled ? '' : 'opacity-60'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">
            {w.kind === 'car' ? '🚗' : w.kind === 'gate' ? '🚪' : '👀'} {w.name}
          </p>
          <p className="text-xs text-white/50">{motion ? 'Avisa mudanças grandes na imagem, das 18h às 6h' : w.stateLabel ? `Agora: ${w.stateLabel}` : w.refs.length ? 'Aguardando leitura…' : 'Falta salvar as fotos de referência'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Toggle label="Ativo" checked={w.enabled} onChange={(v) => void patch({ enabled: v })} />
          <button
            aria-label={`Remover ${w.name}`}
            className="p-2 text-rose-300/70"
            onClick={async () => {
              if (!confirm(`Remover “${w.name}” e as fotos de referência?`)) return;
              await api(`/api/watches/${w.id}`, { method: 'DELETE' }).catch(() => undefined);
              await onChange();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => setZoneOpen((v) => !v)}>
          <Crosshair className="mr-1 inline h-4 w-4" /> {w.zone ? 'Área marcada' : 'Marcar área'}
        </Button>
        {!motion && (
          <Button variant="ghost" onClick={() => void test()} disabled={busy !== null}>
            <Eye className="mr-1 inline h-4 w-4" /> {busy === 'test' ? 'Olhando…' : 'Testar agora'}
          </Button>
        )}
      </div>
      {zoneOpen && <ZoneDraw cameraId={w.cameraId} zone={w.zone} hint={motion ? 'onde observar movimento' : w.kind === 'car' ? 'onde o carro fica estacionado' : 'o portão'} onSave={async (z) => { await patch({ zone: z }); setZoneOpen(false); }} warn={w.refs.length > 0} />}

      {!motion && (
        <div className="grid grid-cols-2 gap-2">
          {(['a', 'b'] as const).map((s) => (
            <div key={s} className="rounded-sm bg-white/5 p-2">
              <p className="mb-1.5 text-xs text-white/60">
                {s === 'a' ? w.labelA : w.labelB} · {refs(s).length} {refs(s).length === 1 ? 'foto' : 'fotos'}
              </p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {refs(s).map((r) => (
                  <span key={r.id} className="relative">
                    <img src={r.thumb} alt="" className="h-12 w-16 rounded-sm object-cover" />
                    <button
                      aria-label="Apagar foto"
                      className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/80 text-white"
                      onClick={async () => {
                        await api(`/api/watches/refs/${r.id}`, { method: 'DELETE' }).catch(() => undefined);
                        await onChange();
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <button
                className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-cyan-300/30 px-2 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => void capture(s)}
                disabled={busy !== null}
                aria-label={`Salvar agora: ${s === 'a' ? w.labelA : w.labelB}`}
              >
                <Camera className="h-4 w-4" /> {busy === s ? 'Salvando…' : 'Salvar foto agora'}
              </button>
            </div>
          ))}
        </div>
      )}
      {!motion && <p className="text-[11px] text-white/40">Dica: salve fotos de dia e de noite de cada estado (2 a 3 de cada) para a Luna acertar sempre.</p>}

      {(w.kind === 'car' || w.kind === 'gate') && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-white/50">
            Acender à noite {w.kind === 'car' ? '(carro chegou)' : '(portão abriu)'}
            <select className={selectClass} value={w.lightEntity ?? ''} onChange={(e) => void patch({ lightEntity: e.target.value || null })}>
              <option value="">Não acender</option>
              {lights.map((d) => (
                <option key={d.entityId} value={d.entityId}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-white/50">
            Apagar depois de (min)
            <input className={selectClass} type="number" min={1} max={120} value={w.lightMinutes} onChange={(e) => void patch({ lightMinutes: Math.max(1, Math.min(120, Number(e.target.value) || 5)) })} />
          </label>
        </div>
      )}
      {w.kind === 'gate' && (
        <label className="block text-xs text-white/50">
          Avisar se ficar aberto por mais de (min) — vazio = não avisar
          <input className={selectClass} type="number" min={1} max={1440} value={w.alertMinutes ?? ''} onChange={(e) => void patch({ alertMinutes: e.target.value ? Math.max(1, Number(e.target.value)) : null })} />
        </label>
      )}
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-300' : 'text-amber-200'}`}>{msg.text}</p>}
    </div>
  );
}

/** Desenhe o retângulo sobre a foto atual da câmera. */
function ZoneDraw({ cameraId, zone: initial, hint, onSave, warn }: { cameraId: string; zone: Zone | null; hint: string; onSave: (z: Zone | null) => Promise<void>; warn: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<Zone | null>(initial);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const pos = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  return (
    <div className="space-y-2 rounded-sm border border-cyan-300/30 p-2">
      <p className="text-xs text-white/60">Arraste sobre a imagem marcando {hint}.</p>
      <div
        ref={box}
        className="relative touch-none select-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const p = pos(e);
          setDrag(p);
          setZone({ x: p.x, y: p.y, w: 0, h: 0 });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = pos(e);
          setZone({ x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) });
        }}
        onPointerUp={() => setDrag(null)}
      >
        <img src={`/api/cameras/${cameraId}/snapshot?t=${Date.now()}`} alt="" className="pointer-events-none w-full rounded-sm" draggable={false} />
        {zone && zone.w > 0 && (
          <div className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.w * 100}%`, height: `${zone.h * 100}%` }} />
        )}
      </div>
      {warn && <p className="text-[11px] text-amber-200/80">Mudar a área apaga as fotos de referência deste item (elas valem só para a área antiga).</p>}
      <div className="flex gap-2">
        <Button disabled={!zone || zone.w < 0.05 || zone.h < 0.05} onClick={() => void onSave(zone)}>
          Salvar área
        </Button>
        <Button variant="ghost" onClick={() => void onSave(null)}>
          Imagem inteira
        </Button>
      </div>
    </div>
  );
}
