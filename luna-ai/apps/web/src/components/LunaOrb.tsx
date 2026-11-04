import { useEffect, useRef, useState } from 'react';
import type { AssistantState } from '@luna/shared';

const TICKS = Array.from({ length: 120 }, (_, i) => i);
const BARS = 72;

/** Nível sintético quando não há áudio real (fala do aparelho, processamento). */
function useAnimatedLevel(state: AssistantState, external: number) {
  const [phase, setPhase] = useState(0);
  const raf = useRef<number | null>(null);
  const animated = state === 'listening' || state === 'speaking' || state === 'processing' || state === 'acting';
  useEffect(() => {
    if (!animated) return;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 50) {
        setPhase(t / 1000);
        last = t;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [animated]);
  const synthetic = state === 'speaking' ? 0.55 : state === 'listening' ? 0.25 : animated ? 0.15 : 0.04;
  return { level: external > 0.02 ? external : synthetic, phase };
}

/**
 * Núcleo HUD da Luna: anéis com marcações girando, barras radiais que reagem à voz
 * e núcleo luminoso. A cor e a velocidade mudam com o estado da assistente.
 */
export function LunaOrb({ state, level = 0, size = 260, onClick, label }: { state: AssistantState; level?: number; size?: number; onClick?: () => void; label?: string }) {
  const { level: lv, phase } = useAnimatedLevel(state, level);
  const bars = Array.from({ length: BARS }, (_, i) => {
    const a = (i / BARS) * Math.PI * 2;
    const wobble = 0.5 + 0.5 * Math.sin(phase * 6 + i * 0.7) * Math.cos(phase * 2.3 + i * 0.31);
    const len = 3 + lv * 26 * (0.35 + 0.65 * wobble);
    const r1 = 96;
    const r2 = r1 + len;
    return { x1: 150 + Math.cos(a) * r1, y1: 150 + Math.sin(a) * r1, x2: 150 + Math.cos(a) * r2, y2: 150 + Math.sin(a) * r2 };
  });

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Falar com a Luna"
      className="hud-core relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      data-state={state}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 300 300" className="h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id="lunaCore" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.25" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="0.65" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <filter id="lunaGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Halo externo */}
        <circle cx="150" cy="150" r="146" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
        <circle className="pulse-ring" cx="150" cy="150" r="132" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />

        {/* Anel de marcações */}
        <g className="spin-slow" stroke="currentColor">
          {TICKS.map((i) => {
            const a = (i / TICKS.length) * Math.PI * 2;
            const long = i % 10 === 0;
            const r1 = long ? 130 : 135;
            return (
              <line
                key={i}
                x1={150 + Math.cos(a) * r1}
                y1={150 + Math.sin(a) * r1}
                x2={150 + Math.cos(a) * 141}
                y2={150 + Math.sin(a) * 141}
                strokeOpacity={long ? 0.9 : 0.35}
                strokeWidth={long ? 1.6 : 1}
              />
            );
          })}
        </g>

        {/* Arcos segmentados */}
        <g className="spin-rev" fill="none" stroke="currentColor">
          <circle cx="150" cy="150" r="123" strokeWidth="2" strokeOpacity="0.55" strokeDasharray="60 18 8 18" />
        </g>
        <g className="spin-fast" fill="none" stroke="currentColor" filter="url(#lunaGlow)">
          <circle cx="150" cy="150" r="112" strokeWidth="5" strokeOpacity="0.85" strokeDasharray="90 145" strokeLinecap="round" />
          <circle cx="150" cy="150" r="112" strokeWidth="1" strokeOpacity="0.3" />
        </g>

        {/* Barras de áudio */}
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8">
          {bars.map((b, i) => (
            <line key={i} {...b} />
          ))}
        </g>

        {/* Núcleo */}
        <circle cx="150" cy="150" r="90" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
        <g className="core-glow">
          <circle cx="150" cy="150" r="78" fill="url(#lunaCore)" opacity={0.55 + lv * 0.45} />
        </g>
        <circle cx="150" cy="150" r="58" fill="#02060b" fillOpacity="0.55" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.2" />
        <polygon
          points={Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 2;
            return `${150 + Math.cos(a) * 46},${150 + Math.sin(a) * 46}`;
          }).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
        <text x="150" y="148" textAnchor="middle" fill="currentColor" style={{ font: '700 20px Orbitron, sans-serif', letterSpacing: '0.18em' }} filter="url(#lunaGlow)">
          LUNA
        </text>
        {label && (
          <text x="150" y="170" textAnchor="middle" fill="currentColor" fillOpacity="0.75" style={{ font: '600 9.5px Rajdhani, sans-serif', letterSpacing: '0.25em' }}>
            {label.toUpperCase()}
          </text>
        )}
      </svg>
    </button>
  );
}
