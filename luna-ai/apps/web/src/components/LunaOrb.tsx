import { useEffect, useRef } from 'react';
import { geoArea, geoGraticule, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import landTopo from 'world-atlas/land-110m.json';
import type { AssistantState } from '@luna/shared';

// Continentes (Natural Earth 1:110m, domínio público)
// Preparado uma vez ao carregar: sem ilhas minúsculas e com metade dos pontos nos contornos
// longos — visualmente idêntico no tamanho do globo e bem mais barato a cada quadro.
const LAND = (() => {
  const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
  const f = feature(topo, topo.objects.land) as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
  const geom = ('features' in f ? f.features[0]!.geometry : f.geometry) as GeoJSON.MultiPolygon;
  const decimate = (ring: GeoJSON.Position[]) => (ring.length > 24 ? ring.filter((_, i) => i % 2 === 0 || i === ring.length - 1) : ring);
  const polys = geom.coordinates
    .filter((poly) => geoArea({ type: 'Polygon', coordinates: poly }) > 0.0004)
    .map((poly) => poly.map(decimate));
  return { type: 'MultiPolygon', coordinates: polys } as GeoJSON.MultiPolygon;
})();
// Malha a cada 15° com amostragem menor (bem menos pontos por quadro)
const GRATICULE = geoGraticule().step([15, 15]).precision(6)();

const STATE_RGB: Record<AssistantState, [number, number, number]> = {
  idle: [0, 229, 255],
  listening: [95, 246, 255],
  processing: [154, 140, 255],
  acting: [255, 181, 71],
  speaking: [58, 168, 255],
  error: [255, 77, 106],
};
/** Graus por segundo de rotação do globo em cada estado. */
const STATE_SPEED: Record<AssistantState, number> = { idle: 9, listening: 14, processing: 40, acting: 55, speaking: 18, error: 3 };
/** Nível “sintético” das barras quando não há áudio real. */
const STATE_LEVEL: Record<AssistantState, number> = { idle: 0.04, listening: 0.3, processing: 0.16, acting: 0.16, speaking: 0.6, error: 0 };

const TICKS = Array.from({ length: 96 }, (_, i) => i);
const BARS = 64;

/**
 * Núcleo da Luna: globo terrestre holográfico + barras de áudio desenhados num único canvas
 * a 60 fps (sem re-renderizar o React), e anéis HUD em camadas que só giram via GPU.
 * Cor, velocidade e nível mudam suavemente (interpolação) conforme o estado.
 */
export function LunaOrb({
  state,
  levelRef,
  size = 260,
  onClick,
  label,
}: {
  state: AssistantState;
  /** Nível de áudio em tempo real (0–1), lido a cada quadro sem re-render. */
  levelRef?: { current: number };
  size?: number;
  onClick?: () => void;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, levelRef });
  live.current = { state, levelRef };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return;
    // Resolução limitada para manter 60 fps em aparelhos antigos
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 1100 / size);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = size / 300; // unidades do desenho original (0–300)
    const c = size / 2;
    const r = 98 * s;
    const projection = geoOrthographic().scale(r).translate([c, c]).clipAngle(90);
    const path = geoPath(projection, ctx);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let lon = -45;
    let speed = STATE_SPEED[live.current.state];
    let level = 0;
    const rgb = [...STATE_RGB[live.current.state]];
    let raf = 0;
    let last = performance.now();
    const col = (a: number) => `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${a})`;

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const st = live.current.state;
      // Interpolação suave entre estados (cor, velocidade e nível)
      const k = 1 - Math.pow(0.001, dt); // ~ independente de fps
      const target = STATE_RGB[st];
      for (let i = 0; i < 3; i++) rgb[i] = rgb[i]! + (target[i]! - rgb[i]!) * k * 0.6;
      speed += (STATE_SPEED[st] - speed) * k * 0.4;
      const real = live.current.levelRef?.current ?? 0;
      const want = real > 0.02 ? real : STATE_LEVEL[st];
      level += (want - level) * Math.min(1, k * 2.5);
      lon += speed * dt;
      projection.rotate([lon, -18, 0]);

      ctx.clearRect(0, 0, size, size);

      // Barras de áudio ao redor
      const time = t / 1000;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = col(0.65);
      ctx.beginPath();
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2;
        const wob = 0.5 + 0.5 * Math.sin(time * 5 + i * 0.8) * Math.cos(time * 2 + i * 0.3);
        const len = (2 + level * 18 * (0.4 + 0.6 * wob)) * s;
        const r1 = 106 * s;
        ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        ctx.lineTo(c + Math.cos(a) * (r1 + len), c + Math.sin(a) * (r1 + len));
      }
      ctx.stroke();

      // Esfera (oceano)
      const g = ctx.createRadialGradient(c * 0.84, c * 0.76, r * 0.1, c, c, r);
      g.addColorStop(0, col(0.22 + level * 0.2));
      g.addColorStop(0.7, 'rgba(2, 10, 18, 0.88)');
      g.addColorStop(1, col(0.2));
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = g;
      ctx.fill();

      // Malha
      ctx.beginPath();
      path(GRATICULE);
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = col(0.17);
      ctx.stroke();

      // Continentes: brilho “falso” (traço largo e transparente) em vez de shadowBlur
      ctx.beginPath();
      path(LAND);
      ctx.fillStyle = col(0.28 + level * 0.25);
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = col(0.16);
      ctx.stroke();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = col(0.95);
      ctx.stroke();

      // Atmosfera
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.lineWidth = 6;
      ctx.strokeStyle = col(0.12 + level * 0.15);
      ctx.stroke();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = col(0.75);
      ctx.stroke();

      if (!reduce) raf = requestAnimationFrame(frame);
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [size]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Falar com a Luna"
      className="hud-core relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      data-state={state}
      style={{ width: size, height: size }}
    >
      {/* Anéis: cada um é uma camada própria que a GPU apenas rotaciona */}
      <div className="orb-layer">
        <svg viewBox="0 0 300 300" className="h-full w-full" aria-hidden="true">
          <circle cx="150" cy="150" r="146" fill="none" stroke="currentColor" strokeOpacity="0.1" />
        </svg>
      </div>
      <div className="orb-layer orb-pulse">
        <svg viewBox="0 0 300 300" className="h-full w-full" aria-hidden="true">
          <circle cx="150" cy="150" r="132" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="orb-layer orb-spin-slow">
        <svg viewBox="0 0 300 300" className="h-full w-full" stroke="currentColor" aria-hidden="true">
          {TICKS.map((i) => {
            const a = (i / TICKS.length) * Math.PI * 2;
            const long = i % 8 === 0;
            return (
              <line
                key={i}
                x1={150 + Math.cos(a) * (long ? 131 : 136)}
                y1={150 + Math.sin(a) * (long ? 131 : 136)}
                x2={150 + Math.cos(a) * 141}
                y2={150 + Math.sin(a) * 141}
                strokeOpacity={long ? 0.8 : 0.28}
                strokeWidth={long ? 1.5 : 1}
              />
            );
          })}
        </svg>
      </div>
      <div className="orb-layer orb-spin-rev">
        <svg viewBox="0 0 300 300" className="h-full w-full" aria-hidden="true">
          <circle cx="150" cy="150" r="124" fill="none" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.5" strokeDasharray="70 20 6 20" />
        </svg>
      </div>
      <div className="orb-layer orb-spin-fast orb-glow">
        <svg viewBox="0 0 300 300" className="h-full w-full" aria-hidden="true">
          <circle cx="150" cy="150" r="116" fill="none" stroke="currentColor" strokeWidth="3.5" strokeOpacity="0.85" strokeDasharray="60 180" strokeLinecap="round" />
        </svg>
      </div>
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size, height: size }} />
      {label && (
        <span className="hud-label pointer-events-none absolute inset-x-0 text-center" style={{ bottom: -size * 0.02, color: 'currentColor', fontSize: Math.max(9, size * 0.034) }}>
          {label}
        </span>
      )}
    </button>
  );
}
