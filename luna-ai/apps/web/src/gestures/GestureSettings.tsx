import { useEffect, useRef, useState } from 'react';
import { Crosshair, Eye, Trash2 } from 'lucide-react';
import { GESTURES, GESTURE_LABELS, type CameraDto, type GestureName, type GestureRuleDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useCameras } from '../stores/cameras';
import { useDevices } from '../stores/devices';
import { useSettings } from '../stores/settings';
import { Button, Toggle } from '../components/ui';
import { useGestureToast } from './useGestureWatcher';
import { cameraFrame, detect, type Detection } from './recognizer';

const ACTIONS: { value: GestureRuleDto['action']; label: string }[] = [
  { value: 'turn_on', label: 'Ligar' },
  { value: 'turn_off', label: 'Desligar' },
  { value: 'toggle', label: 'Ligar/desligar (alternar)' },
];
const DIRECT = 'camera.luna_';
const selectClass = 'w-full rounded-sm border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white';

/** Ajustes › Gestos: regras “gesto + câmera → ação”, prévia ao vivo e área da câmera analisada. */
export function GestureSettings({ isAdmin }: { isAdmin: boolean }) {
  const watch = useSettings((s) => s.gestureWatch);
  const setWatch = useSettings((s) => s.setGestureWatch);
  const status = useGestureToast((s) => s.status);
  const { cameras, load: loadCameras } = useCameras();
  const devices = useDevices((s) => s.devices);
  const [rules, setRules] = useState<GestureRuleDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ gesture: 'open_palm' as GestureName, source: '', action: 'turn_on' as GestureRuleDto['action'], target: '' });
  const [preview, setPreview] = useState<string | null>(null);
  const [zoneFor, setZoneFor] = useState<CameraDto | null>(null);

  const load = () => api<{ rules: GestureRuleDto[] }>('/api/gestures').then((r) => setRules(r.rules)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
    if (!cameras) void loadCameras();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggles = Object.values(devices)
    .filter((d) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const cams = cameras ?? [];
  const sourceName = (s: string) => (s === 'device' ? 'câmera deste aparelho' : (cams.find((c) => c.entityId === s)?.name ?? s));
  const targetName = (t: string) => (t === 'all_lights' ? 'todas as luzes' : (devices[t]?.name ?? t));
  const source = form.source || cams[0]?.entityId || 'device';
  const target = form.target || toggles[0]?.entityId || 'all_lights';

  const add = async () => {
    setError(null);
    try {
      await api('/api/gestures', { body: { gesture: form.gesture, source, action: form.action, target } });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const patch = async (r: GestureRuleDto, p: Partial<GestureRuleDto>) => {
    await api(`/api/gestures/${r.id}`, { method: 'PATCH', body: p }).catch((e) => setError(errorMessage(e)));
    await load();
  };
  const remove = async (r: GestureRuleDto) => {
    await api(`/api/gestures/${r.id}`, { method: 'DELETE' }).catch((e) => setError(errorMessage(e)));
    await load();
  };

  return (
    <div className="space-y-3 px-4 py-3">
      <p className="text-xs text-white/45">
        Faça um gesto e segure por ~1 segundo: a Luna executa a ação. O reconhecimento roda <b>no aparelho</b> (nenhuma imagem vai para a internet). Ligue a análise no aparelho que fica sempre com a Luna
        aberta (ex.: o Android da parede).
      </p>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">Analisar gestos neste aparelho</p>
          <p className="text-xs text-white/40">Estado: {status}</p>
        </div>
        <Toggle label="Analisar gestos neste aparelho" checked={watch} onChange={setWatch} />
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}

      {rules?.map((r) => (
        <div key={r.id} className={`flex items-center gap-2 rounded-sm border border-white/10 px-3 py-2 ${r.enabled ? '' : 'opacity-50'}`}>
          <span className="text-2xl" aria-hidden="true">
            {GESTURE_LABELS[r.gesture].emoji}
          </span>
          <p className="min-w-0 flex-1 text-sm">
            {GESTURE_LABELS[r.gesture].label} <span className="text-white/45">na {sourceName(r.source)}</span>
            <br />→ {ACTIONS.find((a) => a.value === r.action)?.label} <b>{targetName(r.target)}</b>
          </p>
          {isAdmin && (
            <>
              <Toggle label="Ativa" checked={r.enabled} onChange={(v) => void patch(r, { enabled: v })} />
              <button aria-label="Remover regra" onClick={() => void remove(r)} className="p-2 text-rose-300/70">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ))}
      {rules && !rules.length && <p className="text-xs text-white/40">Nenhum gesto configurado ainda.</p>}

      {isAdmin && (
        <div className="space-y-2 rounded-sm border border-cyan-300/20 p-3">
          <p className="text-sm">Novo comando por gesto</p>
          <div className="grid grid-cols-4 gap-1 sm:grid-cols-7">
            {GESTURES.map((g) => (
              <button
                key={g}
                type="button"
                title={GESTURE_LABELS[g].label}
                onClick={() => setForm({ ...form, gesture: g })}
                className={`rounded-sm py-2 text-2xl ${form.gesture === g ? 'border border-cyan-300/70 bg-cyan-400/20' : 'border border-transparent bg-white/5'}`}
              >
                {GESTURE_LABELS[g].emoji}
              </button>
            ))}
          </div>
          <p className="text-xs text-cyan-200/80">{GESTURE_LABELS[form.gesture].label}</p>
          <label className="block text-xs text-white/50">
            Onde
            <select className={selectClass} value={source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {cams.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  Câmera {c.name}
                </option>
              ))}
              <option value="device">Câmera do aparelho que analisa (frontal)</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-white/50">
              Ação
              <select className={selectClass} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as GestureRuleDto['action'] })}>
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-white/50">
              Aparelho
              <select className={selectClass} value={target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                {toggles.map((d) => (
                  <option key={d.entityId} value={d.entityId}>
                    {d.name}
                  </option>
                ))}
                <option value="all_lights">Todas as luzes</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void add()}>Adicionar</Button>
            <Button variant="ghost" onClick={() => setPreview(source)}>
              <Eye className="mr-1 inline h-4 w-4" /> Testar o reconhecimento
            </Button>
            {source.startsWith(DIRECT) && (
              <Button variant="ghost" onClick={() => setZoneFor(cams.find((c) => c.entityId === source) ?? null)}>
                <Crosshair className="mr-1 inline h-4 w-4" /> Área da câmera
              </Button>
            )}
          </div>
        </div>
      )}

      {preview && <Preview source={preview} name={sourceName(preview)} onClose={() => setPreview(null)} />}
      {zoneFor && <ZoneEditor camera={zoneFor} onClose={() => setZoneFor(null)} />}
    </div>
  );
}

/** Prévia ao vivo: mostra o que o reconhecedor está vendo e qual gesto entende. */
function Preview({ source, name, onClose }: { source: string; name: string; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [det, setDet] = useState<Detection | null>(null);
  const [msg, setMsg] = useState('carregando…');

  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    const video = document.createElement('video');
    (async () => {
      try {
        if (source === 'device') {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          await video.play();
        }
        while (alive) {
          const img = source === 'device' ? video : await cameraFrame(source);
          const w = img instanceof HTMLVideoElement ? img.videoWidth : img.width;
          const h = img instanceof HTMLVideoElement ? img.videoHeight : img.height;
          const d = await detect(img);
          const c = canvas.current;
          if (c && w) {
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            if (d.box) {
              ctx.strokeStyle = '#00e5ff';
              ctx.lineWidth = Math.max(2, w / 200);
              ctx.strokeRect(d.box.x * w - 8, d.box.y * h - 8, d.box.w * w + 16, d.box.h * h + 16);
            }
          }
          if (img instanceof ImageBitmap) img.close();
          setDet(d);
          setMsg('');
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (e) {
        setMsg(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [source]);

  return (
    <div className="space-y-2 rounded-sm border border-cyan-300/30 p-2">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Prévia · {name}</span>
        <button onClick={onClose} className="underline">
          fechar
        </button>
      </div>
      <canvas ref={canvas} className="w-full rounded-sm bg-black" style={{ transform: source === 'device' ? 'scaleX(-1)' : undefined }} />
      <p className="font-hud text-center text-lg text-cyan-50">
        {msg || (det?.gesture ? `${GESTURE_LABELS[det.gesture].emoji} ${GESTURE_LABELS[det.gesture].label} · ${Math.round(det.score * 100)}%` : 'nenhum gesto')}
      </p>
      <p className="text-center text-xs text-white/40">Dica: de frente para a câmera, mão bem visível. Se a mão parecer pequena, defina a “Área da câmera” só onde você costuma ficar.</p>
    </div>
  );
}

/** Desenhe um retângulo sobre a imagem: só essa área é analisada (a mão fica maior e o celular/servidor trabalham menos). */
function ZoneEditor({ camera, onClose }: { camera: CameraDto; onClose: () => void }) {
  const id = camera.entityId.slice(DIRECT.length);
  const box = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ cameras: { id: string; gestureZone: typeof zone }[] }>('/api/cameras/direct')
      .then((r) => setZone(r.cameras.find((c) => c.id === id)?.gestureZone ?? null))
      .catch(() => undefined);
  }, [id]);

  const pos = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const save = async (z: typeof zone) => {
    try {
      await api(`/api/cameras/direct/${id}/zone`, { method: 'PUT', body: { zone: z } });
      setMsg(z ? 'Área salva.' : 'Usando a imagem inteira.');
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  return (
    <div className="space-y-2 rounded-sm border border-cyan-300/30 p-2">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Área analisada · {camera.name} — arraste sobre a imagem</span>
        <button onClick={onClose} className="underline">
          fechar
        </button>
      </div>
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
        <img src={`/api/cameras/${camera.entityId}/snapshot?t=${Date.now()}`} alt={camera.name} className="pointer-events-none w-full rounded-sm" draggable={false} />
        {zone && zone.w > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.w * 100}%`, height: `${zone.h * 100}%` }}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!zone || zone.w < 0.05 || zone.h < 0.05} onClick={() => void save(zone)}>
          Salvar área
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setZone(null);
            void save(null);
          }}
        >
          Usar imagem inteira
        </Button>
      </div>
      {msg && <p className="text-xs text-cyan-200/80">{msg}</p>}
    </div>
  );
}
