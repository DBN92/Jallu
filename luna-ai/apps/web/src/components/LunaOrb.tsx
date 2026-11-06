import { useEffect, useRef } from 'react';
import type { AssistantState } from '@luna/shared';
import { waveColors } from '../lib/theme';

type V3 = [number, number, number];
type Shape = 'dust' | 'shell' | 'core' | 'net';

/** Forma da nuvem em cada estado da DIA. */
const STATE_SHAPE: Record<AssistantState, Shape> = { idle: 'shell', listening: 'shell', processing: 'core', acting: 'core', speaking: 'net', error: 'shell' };
/** Velocidade de giro (rad/s) em cada estado. */
const STATE_SPIN: Record<AssistantState, number> = { idle: 0.22, listening: 0.3, processing: 1.6, acting: 1.8, speaking: 0.35, error: 0.1 };
/** “Voz” sintética quando não há áudio real. */
const STATE_LEVEL: Record<AssistantState, number> = { idle: 0.08, listening: 0.2, processing: 0.25, acting: 0.3, speaking: 0.6, error: 0 };
const ERROR_RGB: V3 = [255, 77, 106];
const BUCKETS = 4; // tons entre a cor 1 e a cor 2 do tema

/** Gerador determinístico: a nuvem tem sempre o mesmo “desenho”. */
function rng(seed: number) {
  let s = seed;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (!u) u = next();
    while (!v) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, gauss };
}

/** Posições de cada partícula em cada forma + ligações da rede (calculadas uma vez). */
function buildCloud(n: number, nodes: number, aspect: number) {
  const { next, gauss } = rng(11);
  const shapes: Record<Shape, Float32Array> = { dust: new Float32Array(n * 3), shell: new Float32Array(n * 3), core: new Float32Array(n * 3), net: new Float32Array(n * 3) };
  const phase = new Float32Array(n);
  const dot = new Float32Array(n);
  const tone = new Uint8Array(n);
  const set = (k: Shape, i: number, v: V3) => shapes[k].set(v, i * 3);
  for (let i = 0; i < n; i++) {
    const th = next() * Math.PI * 2;
    const ph = Math.acos(2 * next() - 1);
    const dir: V3 = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    // poeira espalhada pela área toda
    set('dust', i, [(next() - 0.5) * 2.8 * Math.max(1, aspect), (next() - 0.5) * 2.8 * Math.max(1, 1 / aspect), (next() - 0.5) * 2.6]);
    // casca: esfera com algumas partículas “escapando”
    const sr = 0.95 + Math.abs(gauss()) * 0.1 + (next() < 0.15 ? next() * next() * 0.7 : 0);
    set('shell', i, [dir[0] * sr, dir[1] * sr, dir[2] * sr]);
    // núcleo denso
    const cr = Math.abs(gauss()) * 0.18;
    set('core', i, [dir[0] * cr, dir[1] * cr, dir[2] * cr]);
    // rede: nós distribuídos uniformemente (espiral de Fibonacci) + recheio
    if (i < nodes) {
      const y = 1 - (2 * (i + 0.5)) / nodes;
      const r = Math.sqrt(1 - y * y);
      const a = (i + 0.5) * 2.39996;
      const j = 1.05 * (1 + gauss() * 0.03);
      set('net', i, [Math.cos(a) * r * j, y * j, Math.sin(a) * r * j]);
    } else {
      const rr = 0.55 + next() * 0.5;
      set('net', i, [dir[0] * rr, dir[1] * rr, dir[2] * rr]);
    }
    phase[i] = next() * Math.PI * 2;
    dot[i] = 0.6 + next() * 1.4;
    tone[i] = Math.min(BUCKETS - 1, Math.floor(next() * BUCKETS));
  }
  // cada nó liga aos 5 vizinhos mais próximos
  const net = shapes.net;
  const pairs: number[] = [];
  const d: [number, number][] = [];
  for (let i = 0; i < nodes; i++) {
    d.length = 0;
    for (let j = 0; j < nodes; j++) {
      if (j === i) continue;
      const dx = net[i * 3]! - net[j * 3]!;
      const dy = net[i * 3 + 1]! - net[j * 3 + 1]!;
      const dz = net[i * 3 + 2]! - net[j * 3 + 2]!;
      d.push([dx * dx + dy * dy + dz * dz, j]);
    }
    d.sort((x, y) => x[0] - y[0]);
    for (let k = 0; k < 5; k++) if (i < d[k]![1]) pairs.push(i, d[k]![1]);
  }
  return { shapes, phase, dot, tone, pairs: Uint16Array.from(pairs) };
}

/** Pontinho com brilho, pré-desenhado (desenhar imagem é bem mais leve que gradiente por partícula). */
function sprite(rgb: V3) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
  grad.addColorStop(0.38, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.32)`);
  grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

/**
 * Núcleo visual da DIA: nuvem de partículas 3D nas cores do tema.
 * Em repouso é uma esfera que respira; ouvindo, pulsa com a voz; pensando, vira um núcleo
 * brilhante; falando, vira uma esfera de rede (pontos ligados) que pulsa com a fala.
 * Um único canvas, sem re-render do React; pausa quando sai da tela ou o app fica oculto,
 * e usa menos partículas em telas pequenas e aparelhos fracos (TV).
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
  /** Altura (padrão = size, quadrado). Mais baixa = faixa larga, para cartões. */
  height?: number;
  onClick?: () => void;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, levelRef });
  live.current = { state, levelRef };
  const H = height ?? size;
  const kick = useRef<() => void>(() => {});
  useEffect(() => kick.current(), [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return;
    const W = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Quantidade de partículas conforme o tamanho e o aparelho
    const R = Math.min(W, H) * 0.36; // raio da esfera em px
    const weak = (navigator.hardwareConcurrency || 4) <= 4 || /AFT|Tizen|Web0S|SMART-TV/i.test(navigator.userAgent);
    const n = Math.round(Math.max(260, Math.min(2400, R * R * 0.35)) * (weak ? 0.55 : 1));
    const nodes = Math.round(Math.min(n * 0.38, 800));
    const cloud = buildCloud(n, nodes, W / H);
    const pos = new Float32Array(cloud.shapes[STATE_SHAPE[live.current.state]]);
    const proj = new Float32Array(n * 3); // x, y, profundidade (0–1)

    let theme = waveColors();
    let sprites: HTMLCanvasElement[] = [];
    let errSprite = sprite(ERROR_RGB);
    const tones = (): V3[] => Array.from({ length: BUCKETS }, (_, i) => theme.a.map((v, k) => Math.round(v + (theme.b[k]! - v) * (i / (BUCKETS - 1)))) as V3);
    const paint = () => {
      sprites = tones().map(sprite);
      errSprite = sprite(ERROR_RGB);
    };
    paint();
    const onTheme = () => {
      theme = waveColors();
      paint();
    };
    window.addEventListener('luna-theme', onTheme);

    let level = 0;
    let netMix = STATE_SHAPE[live.current.state] === 'net' ? 1 : 0;
    let coreMix = STATE_SHAPE[live.current.state] === 'core' ? 1 : 0;
    let errMix = 0;
    let spin = STATE_SPIN[live.current.state];
    let ry = 0;
    let raf = 0;
    let last = performance.now();
    let visible = true;

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const time = t / 1000;
      const st = live.current.state;
      const shape = cloud.shapes[STATE_SHAPE[st]];
      const k = reduce ? 1 : 1 - Math.pow(0.02, dt); // aproximação suave (~1 s); sem animação, vai direto

      const real = live.current.levelRef?.current ?? 0;
      const synthetic = st === 'speaking' ? STATE_LEVEL.speaking * (0.4 + 0.6 * Math.abs(Math.sin(time * 9) * Math.sin(time * 2.3 + 1))) : STATE_LEVEL[st];
      const want = real > 0.02 ? Math.min(1, 0.1 + real * 1.2) : synthetic;
      level += (want - level) * Math.min(1, dt * 12);
      netMix += ((STATE_SHAPE[st] === 'net' ? 1 : 0) - netMix) * k;
      coreMix += ((STATE_SHAPE[st] === 'core' ? 1 : 0) - coreMix) * k * 1.5;
      errMix += ((st === 'error' ? 1 : 0) - errMix) * k;
      spin += (STATE_SPIN[st] - spin) * k;
      ry += spin * dt;
      const rx = 0.25 + Math.sin(time * 0.3) * 0.15;
      const cy = Math.cos(ry);
      const sy = Math.sin(ry);
      const cx = Math.cos(rx);
      const sx = Math.sin(rx);
      const scale = R * (1 + level * 0.08) * (1 + 0.025 * Math.sin(time * 1.4)); // respiração
      const pulse = STATE_SHAPE[st] === 'shell' ? 0.15 * level : 0;

      for (let i = 0; i < n; i++) {
        const o = i * 3;
        const ph = cloud.phase[i]!;
        // cada partícula “anda” até a forma do estado atual
        pos[o] = pos[o]! + (shape[o]! - pos[o]!) * k;
        pos[o + 1] = pos[o + 1]! + (shape[o + 1]! - pos[o + 1]!) * k;
        pos[o + 2] = pos[o + 2]! + (shape[o + 2]! - pos[o + 2]!) * k;
        const p = 1 + pulse * Math.sin(ph + time * 4);
        const x = pos[o]! * p + Math.sin(time * 1.3 + ph) * 0.02;
        const y = pos[o + 1]! * p + Math.cos(time * 1.1 + ph) * 0.02;
        const z = pos[o + 2]! * p;
        const X = x * cy + z * sy;
        const Z0 = -x * sy + z * cy;
        const Y = y * cx - Z0 * sx;
        const Z = y * sx + Z0 * cx;
        const f = 2.6 / (2.6 + Z);
        proj[o] = W / 2 + X * scale * f;
        proj[o + 1] = H / 2 + Y * scale * f;
        proj[o + 2] = Math.max(0.15, (2 - Z) / 3); // perto = mais forte
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // Linhas da rede (só ao falar), em 3 faixas de profundidade
      if (netMix > 0.02) {
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, `rgb(${theme.a.join(',')})`);
        grad.addColorStop(1, `rgb(${theme.b.join(',')})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(0.6, R / 140);
        for (let band = 0; band < 3; band++) {
          ctx.beginPath();
          for (let q = 0; q < cloud.pairs.length; q += 2) {
            const a = cloud.pairs[q]! * 3;
            const b = cloud.pairs[q + 1]! * 3;
            const depth = (proj[a + 2]! + proj[b + 2]!) / 2;
            if (Math.min(2, Math.floor(depth * 3)) !== band) continue;
            ctx.moveTo(proj[a]!, proj[a + 1]!);
            ctx.lineTo(proj[b]!, proj[b + 1]!);
          }
          ctx.globalAlpha = netMix * (0.12 + band * 0.12) * (0.75 + level * 0.6);
          ctx.stroke();
        }
      }

      // Partículas
      const dotScale = Math.max(0.75, Math.min(1.25, R / 110)) * 8;
      const bright = 0.85 + coreMix * 0.4;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        const X = proj[o]!;
        const Y = proj[o + 1]!;
        if (X < -10 || X > W + 10 || Y < -10 || Y > H + 10) continue;
        const depth = proj[o + 2]!;
        const ph = cloud.phase[i]!;
        const a = (0.25 + depth) * bright * (0.7 + level * 0.4) * (0.7 + 0.3 * Math.sin(time * 2 + ph));
        if (a < 0.03) continue;
        const r = cloud.dot[i]! * dotScale * (0.6 + depth * 0.5) * (i < nodes ? 1 + netMix * 0.3 : 1);
        ctx.globalAlpha = Math.min(1, a) * (1 - errMix);
        ctx.drawImage(sprites[cloud.tone[i]!]!, X - r / 2, Y - r / 2, r, r);
        if (errMix > 0.02) {
          ctx.globalAlpha = Math.min(1, a) * errMix;
          ctx.drawImage(errSprite, X - r / 2, Y - r / 2, r, r);
        }
      }

      // Brilho central ao pensar
      if (coreMix > 0.02) {
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * 0.7);
        g.addColorStop(0, `rgba(235,250,255,${0.55 * coreMix})`);
        g.addColorStop(0.4, `rgba(${theme.a.join(',')},${0.25 * coreMix})`);
        g.addColorStop(1, `rgba(${theme.a.join(',')},0)`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(W / 2 - R, H / 2 - R, R * 2, R * 2);
      }
      ctx.globalAlpha = 1;

      if (!reduce && visible && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
    };

    const resume = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (visible && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
    };
    // Pausa quando sai da tela (ex.: outro slide do carrossel) para poupar bateria
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      resume();
    });
    io.observe(canvas);
    raf = requestAnimationFrame(frame);
    // Com “reduzir movimento”, desenha um quadro só a cada troca de estado
    kick.current = () => {
      if (reduce) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      kick.current = () => {};
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('luna-theme', onTheme);
    };
  }, [size, H]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Falar com a DIA"
      className="hud-core relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      data-state={state}
      style={{ width: size, height: H }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size, height: H }} />
      {label && (
        <span className="hud-label pointer-events-none absolute inset-x-0 text-center" style={{ bottom: Math.min(size, H) * 0.04, color: 'currentColor', fontSize: Math.max(9, Math.min(size, H) * 0.034) }}>
          {label}
        </span>
      )}
    </button>
  );
}
