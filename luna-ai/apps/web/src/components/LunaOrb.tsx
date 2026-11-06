import { useEffect, useRef } from 'react';
import type { AssistantState } from '@luna/shared';
import { waveColors } from '../lib/theme';

const STATE_RGB: Record<AssistantState, [number, number, number]> = {
  idle: [0, 229, 255],
  listening: [95, 246, 255],
  processing: [154, 140, 255],
  acting: [255, 181, 71],
  speaking: [58, 200, 255],
  error: [255, 77, 106],
};
/** Velocidade das ondas (fase por segundo) em cada estado. */
const STATE_SPEED: Record<AssistantState, number> = { idle: 1.2, listening: 2.4, processing: 6, acting: 7, speaking: 3.6, error: 0.6 };
/** Altura “sintética” das ondas quando não há áudio real. */
const STATE_LEVEL: Record<AssistantState, number> = { idle: 0.24, listening: 0.42, processing: 0.32, acting: 0.34, speaking: 0.75, error: 0.03 };

/** Camadas de onda: frequência, opacidade, espessura, deslocamento de fase e sentido. */
const WAVES = [
  { freq: 1, alpha: 0.95, width: 2.6, phase: 0, dir: 1 },
  { freq: 1.6, alpha: 0.55, width: 1.8, phase: 1.3, dir: -1 },
  { freq: 2.3, alpha: 0.38, width: 1.5, phase: 2.1, dir: 1 },
  { freq: 0.7, alpha: 0.28, width: 1.2, phase: 0.6, dir: -1 },
];

/**
 * Núcleo da Luna em estilo osciloscópio: ondas de linha que dançam com a voz.
 * Desenhado num único canvas a 60 fps (sem re-renderizar o React); o brilho é “falso”
 * (traço largo e transparente por baixo) para continuar leve no celular e na TV.
 * Cor, velocidade e altura mudam suavemente conforme o estado.
 */
export function LunaOrb({
  state,
  levelRef,
  size = 260,
  height,
  onClick,
  label,
}: {
  state: AssistantState;
  /** Nível de áudio em tempo real (0–1), lido a cada quadro sem re-render. */
  levelRef?: { current: number };
  size?: number;
  /** Altura (padrão = size, quadrado). Mais baixa = onda larga, para cartões. */
  height?: number;
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
    const H = height ?? size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 1100 / size);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const s = size / 300;
    const left = 14 * s;
    const right = size - 14 * s;
    const mid = H / 2;
    const span = right - left;
    const step = Math.max(2, Math.round(3 * s)); // px entre pontos (≈ 100 pontos por onda)
    const maxAmp = Math.min(size * 0.36, H * 0.44);
    // Cores do tema (temas modernos: degradê entre os dois destaques)
    let theme = waveColors();
    const onTheme = () => (theme = waveColors());
    window.addEventListener('luna-theme', onTheme);

    let speed = STATE_SPEED[live.current.state];
    let level = 0;
    let phase = 0;
    const rgb = [...STATE_RGB[live.current.state]];
    let raf = 0;
    let last = performance.now();
    const col = (a: number) => `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${a})`;

    const wave = (w: (typeof WAVES)[number], amp: number, time: number) => {
      ctx.beginPath();
      for (let x = left; x <= right + 0.5; x += step) {
        const u = (x - size / 2) / (span / 2); // -1..1 (centro horizontal)
        const env = (1 - u * u) * (1 - u * u); // some nas pontas
        const y = mid + Math.sin(x * (0.025 / s) * w.freq + phase * w.dir * (1 + w.freq * 0.4) + w.phase) * env * amp * (0.55 + 0.45 * Math.sin(time * 1.7 + w.phase));
        if (x === left) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const time = t / 1000;
      const st = live.current.state;
      const k = 1 - Math.pow(0.001, dt);
      const calm = st === 'idle' || st === 'listening' || st === 'speaking';
      const target = theme.modern && calm ? theme.a : STATE_RGB[st];
      for (let i = 0; i < 3; i++) rgb[i] = rgb[i]! + (target[i]! - rgb[i]!) * k * 0.6;
      speed += (STATE_SPEED[st] - speed) * k * 0.5;
      const real = live.current.levelRef?.current ?? 0;
      // Sem áudio real, a fala “sintética” oscila como uma voz (sílabas)
      const synthetic = st === 'speaking' ? STATE_LEVEL.speaking * (0.45 + 0.55 * Math.abs(Math.sin(time * 2.1) * Math.sin(time * 3.7 + 1))) : STATE_LEVEL[st];
      const want = real > 0.02 ? Math.min(1, 0.15 + real * 1.1) : synthetic;
      level += (want - level) * Math.min(1, k * 3);
      phase += speed * dt;

      ctx.clearRect(0, 0, size, H);
      // Nos temas modernos, a onda vai da cor 1 à cor 2 do tema
      let stroke: string | CanvasGradient | null = null;
      if (theme.modern && calm) {
        const g = ctx.createLinearGradient(left, 0, right, 0);
        g.addColorStop(0, `rgb(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0})`);
        g.addColorStop(1, `rgb(${theme.b[0]}, ${theme.b[1]}, ${theme.b[2]})`);
        stroke = g;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Linha de base e marcas (régua de osciloscópio) — só no tema HUD
      if (!theme.modern) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = col(0.22);
      ctx.beginPath();
      ctx.moveTo(left, mid);
      ctx.lineTo(right, mid);
      for (let i = 0; i <= 10; i++) {
        const x = left + (span * i) / 10;
        const h = (i % 5 === 0 ? 7 : 3.5) * s;
        ctx.moveTo(x, mid - h);
        ctx.lineTo(x, mid + h);
      }
      ctx.stroke();
      }

      const amp = maxAmp * (0.06 + level * 0.94);
      // Camadas de trás para frente; a principal ganha brilho
      for (let i = WAVES.length - 1; i >= 0; i--) {
        const w = WAVES[i]!;
        wave(w, amp * (i === 0 ? 1 : 0.85), time);
        if (stroke) {
          if (i === 0) {
            ctx.globalAlpha = 0.14 + level * 0.12;
            ctx.lineWidth = w.width * s * 4.5;
            ctx.strokeStyle = stroke;
            ctx.stroke();
          }
          ctx.globalAlpha = w.alpha;
          ctx.lineWidth = w.width * s;
          ctx.strokeStyle = stroke;
          ctx.stroke();
          ctx.globalAlpha = 1;
          continue;
        }
        if (i === 0) {
          ctx.lineWidth = w.width * s * 4.5;
          ctx.strokeStyle = col(0.12 + level * 0.12);
          ctx.stroke();
        }
        ctx.lineWidth = w.width * s;
        ctx.strokeStyle = col(w.alpha);
        ctx.stroke();
      }

      // Pontos nas extremidades (pulsam levemente)
      const dotR = (2.2 + level * 1.6) * s;
      if (!theme.modern) {
        ctx.fillStyle = col(0.9);
        ctx.beginPath();
        ctx.arc(left, mid, dotR, 0, Math.PI * 2);
        ctx.arc(right, mid, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

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
      window.removeEventListener('luna-theme', onTheme);
    };
  }, [size, height]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Falar com a Luna"
      className="hud-core relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      data-state={state}
      style={{ width: size, height: height ?? size }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size, height: height ?? size }} />
      {label && (
        <span className="hud-label pointer-events-none absolute inset-x-0 text-center" style={{ bottom: size * 0.16, color: 'currentColor', fontSize: Math.max(9, size * 0.034) }}>
          {label}
        </span>
      )}
    </button>
  );
}
