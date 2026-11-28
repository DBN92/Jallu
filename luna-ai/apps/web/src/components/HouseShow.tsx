import { useCallback, useEffect, useRef } from 'react';
import { useHouseState } from '../hooks/useHouseState';

const FLOORS = [
  { id: 'superior', label: 'Andar de cima' },
  { id: 'terreo', label: 'Térreo' },
] as const;

/**
 * Maquete 3D para o descanso de tela: os dois andares separados (um em cima do outro), girando
 * devagar e no mesmo ângulo, com as luzes como estão de verdade. Só exibe; não aceita toque.
 */
export function HouseShow({ active }: { active: boolean }) {
  const { state, links } = useHouseState();
  const frames = useRef<(HTMLIFrameElement | null)[]>([]);
  const latest = useRef({ state, active });
  latest.current = { state, active };
  const post = useCallback(() => {
    for (const f of frames.current) {
      f?.contentWindow?.postMessage(latest.current.state, location.origin);
      f?.contentWindow?.postMessage({ type: 'casa3d-show', active: latest.current.active }, location.origin);
    }
  }, []);
  useEffect(() => {
    if (links) post();
  }, [state, links, active, post]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === location.origin && (e.data as { type?: string } | null)?.type === 'casa3d-ready' && frames.current.some((f) => f?.contentWindow === e.source)) post();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [post]);
  return (
    <div className="flex h-full flex-col gap-1">
      {FLOORS.map((f, i) => (
        <div key={f.id} className="relative min-h-0 flex-1">
          <span className="hud-label absolute top-1 left-0 z-10 text-[10px]">{f.label}</span>
          <iframe ref={(el) => void (frames.current[i] = el)} src={`/casa3d.html?luna=1&show=1#${f.id}`} title={`Casa em 3D: ${f.label}`} className="pointer-events-none h-full w-full border-0 bg-transparent" tabIndex={-1} aria-hidden onLoad={post} />
        </div>
      ))}
    </div>
  );
}
