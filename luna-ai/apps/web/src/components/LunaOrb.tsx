import { useEffect, useRef, useState } from 'react';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import landTopo from 'world-atlas/land-110m.json';
import type { AssistantState } from '@luna/shared';

// Continentes (Natural Earth 1:110m, domínio público)
const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land);
const GRATICULE = geoGraticule10();
const TICKS = Array.from({ length: 96 }, (_, i) => i);

const STATE_COLOR: Record<AssistantState, string> = {
  idle: '#00e5ff',
  listening: '#5ff6ff',
  processing: '#9a8cff',
  acting: '#ffb547',
  speaking: '#3aa8ff',
  error: '#ff4d6a',
};
/** Graus por segundo de rotação do globo em cada estado. */
const STATE_SPEED: Record<AssistantState, number> = { idle: 8, listening: 14, processing: 45, acting: 60, speaking: 18, error: 2 };

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Globo terrestre holográfico desenhado em canvas (leve: ~25 fps, pausa em segundo plano). */
function Globe({ state, level, px }: { state: AssistantState; level: number; px: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, level });
  live.current = { state, level };

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = px / 2 - 2;
    const projection = geoOrthographic().scale(r).translate([px / 2, px / 2]).clipAngle(90);
    const path = geoPath(projection, ctx);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lon = -45; // começa mostrando as Américas
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;

    const draw = () => {
      const { state: st, level: lv } = live.current;
      const color = STATE_COLOR[st];
      projection.rotate([lon, -18, 0]);
      ctx.clearRect(0, 0, px, px);

      // Esfera (oceano) com brilho interno
      const g = ctx.createRadialGradient(px * 0.42, px * 0.38, r * 0.1, px / 2, px / 2, r);
      g.addColorStop(0, rgba(color, 0.22 + lv * 0.2));
      g.addColorStop(0.7, 'rgba(2, 10, 18, 0.85)');
      g.addColorStop(1, rgba(color, 0.18));
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = g;
      ctx.fill();

      // Malha de latitude/longitude
      ctx.beginPath();
      path(GRATICULE);
      ctx.strokeStyle = rgba(color, 0.18);
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Continentes
      ctx.beginPath();
      path(LAND);
      ctx.fillStyle = rgba(color, 0.28 + lv * 0.25);
      ctx.fill();
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = rgba(color, 0.9);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Contorno da atmosfera
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.strokeStyle = rgba(color, 0.7);
      ctx.lineWidth = 1.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14 + lv * 20;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      lon += STATE_SPEED[live.current.state] * dt;
      if (t - lastDraw < 40) return; // ~25 fps
      lastDraw = t;
      draw();
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (document.visibilityState === 'visible' && !reduce) raf = requestAnimationFrame(loop);
    };
    draw();
    if (!reduce) raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [px]);

  return <canvas ref={ref} style={{ width: px, height: px }} />;
}

/** Fase (~20 fps) para as barras de áudio ao redor do globo. */
function usePhase(active: boolean) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 50) {
        setPhase(t / 1000);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return phase;
}

/**
 * Núcleo da Luna: globo terrestre holográfico girando, emoldurado por anéis HUD
 * e barras que reagem à voz. Cor e velocidade de rotação mudam com o estado.
 */
export function LunaOrb({ state, level = 0, size = 260, onClick, label }: { state: AssistantState; level?: number; size?: number; onClick?: () => void; label?: string }) {
  const animated = state !== 'idle' && state !== 'error';
  const phase = usePhase(animated);
  const synthetic = state === 'speaking' ? 0.6 : state === 'listening' ? 0.3 : state === 'processing' || state === 'acting' ? 0.15 : 0.03;
  const lv = level > 0.02 ? level : synthetic;

  const bars = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    const wobble = 0.5 + 0.5 * Math.sin(phase * 5 + i * 0.8) * Math.cos(phase * 2 + i * 0.3);
    const len = 2 + lv * 18 * (0.4 + 0.6 * wobble);
    return { x1: 150 + Math.cos(a) * 106, y1: 150 + Math.sin(a) * 106, x2: 150 + Math.cos(a) * (106 + len), y2: 150 + Math.sin(a) * (106 + len) };
  });
  const globePx = Math.round(size * (196 / 300));

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Falar com a Luna"
      className="hud-core relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      data-state={state}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="globe-float rounded-full" style={{ boxShadow: `0 0 ${30 + lv * 40}px ${STATE_COLOR[state]}33` }}>
          <Globe state={state} level={lv} px={globePx} />
        </div>
      </div>
      <svg viewBox="0 0 300 300" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <filter id="lunaGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="150" cy="150" r="146" fill="none" stroke="currentColor" strokeOpacity="0.1" />
        <circle className="pulse-ring" cx="150" cy="150" r="132" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
        <g className="spin-slow" stroke="currentColor">
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
        </g>
        <g className="spin-rev" fill="none" stroke="currentColor">
          <circle cx="150" cy="150" r="124" strokeWidth="1.6" strokeOpacity="0.5" strokeDasharray="70 20 6 20" />
        </g>
        <g className="spin-fast" fill="none" stroke="currentColor" filter="url(#lunaGlow)">
          <circle cx="150" cy="150" r="116" strokeWidth="3.5" strokeOpacity="0.8" strokeDasharray="60 180" strokeLinecap="round" />
        </g>
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.65">
          {bars.map((b, i) => (
            <line key={i} {...b} />
          ))}
        </g>
        {label && (
          <text x="150" y="300" textAnchor="middle" fill="currentColor" fillOpacity="0.85" style={{ font: '600 10px Rajdhani, sans-serif', letterSpacing: '0.3em' }}>
            {label.toUpperCase()}
          </text>
        )}
      </svg>
    </button>
  );
}
