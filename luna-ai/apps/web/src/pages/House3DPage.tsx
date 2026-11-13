import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HOUSE_AUTOMATIONS, type DeviceDto, type HouseAutomationId, type HouseLinksDto } from '@luna/shared';
import { api, errorMessage } from '../services/api';
import { useAuth } from '../stores/auth';
import { useDevices } from '../stores/devices';
import { normalizeName, resolveHouseLinks } from '../lib/houseLinks';
import { useHouseState } from '../hooks/useHouseState';

interface Cmd {
  type: 'casa3d-cmd';
  id: HouseAutomationId;
  on?: boolean;
  level?: number;
  hex?: string;
}

const rgbOf = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Casa em 3D: a maquete roda num quadro (casa3d.html) e esta tela faz a ponte com o Home Assistant.
 * Estado real das luzes → maquete; toques na maquete → comandos pelas rotas normais de aparelhos.
 */
export default function House3DPage() {
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const { devices, links, setLinks, resolved, state } = useHouseState();
  const upsert = useDevices((s) => s.upsert);
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const post = useCallback(() => frame.current?.contentWindow?.postMessage(stateRef.current, location.origin), []);
  useEffect(() => {
    if (links) post();
  }, [state, links, post]);

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: string } | null;
      if (data?.type === 'casa3d-ready') return post();
      if (data?.type !== 'casa3d-cmd') return;
      const cmd = data as Cmd;
      const d = resolveHouseLinks(links ?? {}, Object.values(useDevices.getState().devices))[cmd.id]?.device;
      if (!d) return;
      try {
        let after: DeviceDto | null = null;
        if (typeof cmd.on === 'boolean') after = await api<DeviceDto>(`/api/devices/${d.entityId}/${cmd.on ? 'turn-on' : 'turn-off'}`, { method: 'POST' });
        if (typeof cmd.level === 'number') after = await api<DeviceDto>(`/api/devices/${d.entityId}/brightness`, { body: { brightness: Math.max(1, Math.min(100, Math.round(cmd.level))) } });
        const rgb = cmd.hex ? rgbOf(cmd.hex) : null;
        if (rgb) after = await api<DeviceDto>(`/api/devices/${d.entityId}/color`, { body: { rgb } });
        if (after) upsert(after);
      } catch (err) {
        setMsg(errorMessage(err));
        post(); // volta a maquete ao estado real
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [links, post, upsert]);

  const save = async (id: HouseAutomationId, value: string) => {
    try {
      setLinks(value === 'auto' ? await api<HouseLinksDto>(`/api/house/links/${id}`, { method: 'DELETE' }) : await api<HouseLinksDto>(`/api/house/links/${id}`, { method: 'PUT', body: { entityId: value === 'none' ? null : value } }));
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };

  const missing = HOUSE_AUTOMATIONS.filter((a) => !resolved[a.id]?.device);
  const candidates = (domains: readonly string[]) =>
    Object.values(devices)
      .filter((d) => d.controllable && domains.includes(d.domain))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <div className="dock-pad relative flex min-h-0 flex-1 flex-col">
      <iframe ref={frame} src="/casa3d.html?luna=1" title="Casa em 3D" className="min-h-0 w-full flex-1 border-0" onLoad={post} />

      <div className="pointer-events-none absolute top-[76px] right-3 left-3 flex items-start justify-between gap-2" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 70px)' }}>
        <button className="m-chip pointer-events-auto" style={{ background: 'rgba(28,28,32,.7)' }} onClick={() => navigate('/casa')} aria-label="Voltar para Minha casa">
          <ChevronLeft className="h-4 w-4" /> Aparelhos
        </button>
        {isAdmin && links && (
          <button className="m-chip pointer-events-auto" style={{ background: 'rgba(28,28,32,.7)' }} onClick={() => setEditing(true)}>
            <Link2 className="h-4 w-4" /> Vínculos{missing.length ? ` · faltam ${missing.length}` : ''}
          </button>
        )}
      </div>

      {msg && <p className="absolute right-3 bottom-4 left-3 z-10 mx-auto max-w-md rounded-2xl bg-rose-500/90 px-4 py-2.5 text-center text-sm text-white">{msg}</p>}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-3 sm:items-center" onClick={() => setEditing(false)}>
          <div className="m-card w-full max-w-md" style={{ background: 'var(--card-solid, #151a22)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Vínculos com o Home Assistant">
            <p className="text-lg font-semibold">Vínculos com o Home Assistant</p>
            <p className="m-muted mt-1 mb-3 text-[13px]">Escolha qual aparelho de verdade cada item da maquete controla. Em “Automático”, a Luna usa o aparelho com o mesmo nome.</p>
            {HOUSE_AUTOMATIONS.map((a) => {
              const r = resolved[a.id];
              const stored = links?.[a.id];
              const value = stored === undefined ? 'auto' : stored === null ? 'none' : stored;
              const auto = Object.values(devices).find((d) => d.controllable && (a.domains as readonly string[]).includes(d.domain) && normalizeName(d.name) === normalizeName(a.name));
              return (
                <label key={a.id} className="block border-t border-white/10 py-2.5 first:border-t-0">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{a.name}</span>
                    <span className="m-muted text-xs">{a.room}</span>
                  </span>
                  <select className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2 text-sm" value={value} onChange={(e) => void save(a.id, e.target.value)} aria-label={`Aparelho de ${a.name}`}>
                    <option value="auto">Automático{auto ? ` (${auto.name})` : ' (nenhum aparelho com esse nome)'}</option>
                    <option value="none">Nenhum</option>
                    {candidates(a.domains).map((d) => (
                      <option key={d.entityId} value={d.entityId}>
                        {d.name} · {d.entityId}
                      </option>
                    ))}
                  </select>
                  {!r?.device && <span className="mt-1 block text-xs text-amber-200">Sem vínculo: aparece na maquete sem botão.</span>}
                </label>
              );
            })}
            <button className="m-chip act mt-3 w-full justify-center" onClick={() => setEditing(false)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
