import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { DeviceDto, VacuumInfo } from '@luna/shared';
import { fanLabel } from './VacuumCard';

type Mode = 'start' | 'end';
interface Show {
  id: number;
  mode: Mode;
  name: string;
  battery: number | null;
  fan: string | null;
}

/** Fases que contam como “estava parado” (sair delas para limpando = começou). Pausado → limpando é só continuar. */
const IDLE_PHASES = new Set<VacuumInfo['phase']>(['docked', 'idle', 'returning', 'error', 'unknown']);
const WORKING_PHASES = new Set<VacuumInfo['phase']>(['cleaning', 'paused', 'returning']);

interface ShowState {
  queue: Show[];
  /** Última fase vista em tempo real (separada da lista, que muda antes pela resposta do botão) */
  last: Record<string, VacuumInfo['phase']>;
  seed: (devices: DeviceDto[]) => void;
  observe: (d: DeviceDto) => void;
  done: () => void;
}

let seq = 0;
export const useVacuumShow = create<ShowState>((set, get) => ({
  queue: [],
  last: {},
  seed: (devices) =>
    set((s) => ({
      last: { ...s.last, ...Object.fromEntries(devices.filter((d) => d.vacuum).map((d) => [d.entityId, d.vacuum!.phase])) },
    })),
  /** Chamado a cada atualização em tempo real do Home Assistant. */
  observe: (d) => {
    if (!d.vacuum) return;
    const prev = get().last[d.entityId];
    const now = d.vacuum.phase;
    set((s) => ({ last: { ...s.last, [d.entityId]: now } }));
    if (!prev || prev === now) return;
    let mode: Mode | null = null;
    if (now === 'cleaning' && IDLE_PHASES.has(prev)) mode = 'start';
    else if (now === 'docked' && WORKING_PHASES.has(prev)) mode = 'end';
    if (!mode) return;
    const show: Show = { id: ++seq, mode, name: d.name, battery: d.vacuum.battery, fan: d.vacuum.fanSpeed };
    set((s) => ({ queue: [...s.queue.filter((q) => !(q.name === show.name && q.mode === show.mode)), show].slice(-3) }));
  },
  done: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

const DURATION: Record<Mode, number> = { start: 4.6, end: 5.0 };
const NS = 'http://www.w3.org/2000/svg';

/** Monta a cena (piso, base, trilha, sujeira, robô) e devolve a função que desenha o instante t. */
function buildScene(svg: SVGSVGElement, a1: string, a2: string) {
  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    parent.appendChild(e);
    return e;
  };
  svg.innerHTML = `<defs>
   <linearGradient id="va-acc" x1="0" x2="1"><stop offset="0" stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient>
   <radialGradient id="va-body" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#e7eaf0"/><stop offset="1" stop-color="#b9bfca"/></radialGradient>
   <radialGradient id="va-lidar" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#5b6170"/><stop offset="1" stop-color="#1b1e26"/></radialGradient>
   <radialGradient id="va-glow"><stop offset="0" stop-color="${a1}" stop-opacity=".55"/><stop offset="1" stop-color="${a1}" stop-opacity="0"/></radialGradient>
   <radialGradient id="va-green"><stop offset="0" stop-color="#34d399" stop-opacity=".6"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/></radialGradient>
   <pattern id="va-floor" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#151827"/><path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,.045)"/></pattern>
   <clipPath id="va-room"><rect x="14" y="14" width="332" height="222" rx="22"/></clipPath></defs>`;
  el('rect', { x: 14, y: 14, width: 332, height: 222, rx: 22, fill: 'url(#va-floor)', stroke: 'rgba(255,255,255,.06)' }, svg);
  const room = el('g', { 'clip-path': 'url(#va-room)' }, svg);
  const shine = el('rect', { x: 14, y: 14, width: 332, height: 222, fill: 'url(#va-acc)', opacity: 0 }, room);

  // Trilha em zigue-zague (sai da base, sobe e varre faixa por faixa)
  const pts: [number, number][] = [[64, 125], [92, 125], [92, 48]];
  for (let i = 0, y = 48; y <= 214; i++, y += 34) {
    pts.push([i % 2 ? 92 : 318, y]);
    if (y + 34 <= 214) pts.push([i % 2 ? 92 : 318, y + 34]);
  }
  const d = 'M' + pts.map((p) => p.join(' ')).join(' L');
  const trail = el('path', { d, fill: 'none', stroke: 'url(#va-acc)', 'stroke-width': 30, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.16 }, room);
  const trailLine = el('path', { d, fill: 'none', stroke: 'url(#va-acc)', 'stroke-width': 1.6, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round', opacity: 0 }, room);
  const LEN = trail.getTotalLength();
  trail.style.strokeDasharray = `${LEN} ${LEN}`;

  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const dust = Array.from({ length: 46 }, () => {
    const x = 90 + rnd() * 236;
    const y = 36 + rnd() * 186;
    return { x, y, r: 0.8 + rnd() * 1.6, gone: false, e: el('circle', { cx: x, cy: y, r: 1, fill: '#c9b99a', opacity: 0.75 }, room) };
  });
  const sparkles = Array.from({ length: 9 }, () => {
    const g = el('g', { opacity: 0 }, room);
    el('path', { d: 'M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z', fill: '#fff' }, g);
    return { g, x: 110 + rnd() * 200, y: 40 + rnd() * 170, d: rnd() };
  });

  // Base de carregamento
  const dock = el('g', { transform: 'translate(30 125)' }, svg);
  el('rect', { x: -16, y: -34, width: 22, height: 68, rx: 9, fill: '#e9ecf2' }, dock);
  el('rect', { x: -6, y: -26, width: 6, height: 52, rx: 3, fill: '#c3c9d4' }, dock);
  el('rect', { x: 6, y: -12, width: 4, height: 7, rx: 1, fill: '#d4a24c' }, dock);
  el('rect', { x: 6, y: 5, width: 4, height: 7, rx: 1, fill: '#d4a24c' }, dock);
  const dockLed = el('circle', { cx: -5, cy: -26, r: 2.4, fill: '#34d399' }, dock);

  // Robô aspirador visto de cima (desenho genérico, sem marca)
  const robot = el('g', {}, svg);
  const charge = el('circle', { r: 46, fill: 'url(#va-green)', opacity: 0 }, robot);
  const halo = el('circle', { r: 50, fill: 'url(#va-glow)', opacity: 0 }, robot);
  el('ellipse', { cx: 2, cy: 4, rx: 31, ry: 31, fill: 'rgba(0,0,0,.45)' }, robot);
  const brush = el('g', { transform: 'translate(19 -21)' }, robot);
  for (let i = 0; i < 3; i++) el('line', { x1: 0, y1: 0, x2: 0, y2: -13, stroke: '#9aa3b2', 'stroke-width': 1.4, 'stroke-linecap': 'round', transform: `rotate(${i * 120})` }, brush);
  el('circle', { r: 30, fill: 'url(#va-body)' }, robot);
  el('path', { d: 'M-24 -18 A30 30 0 0 1 24 -18', fill: 'none', stroke: '#9aa2ad', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, robot);
  el('circle', { cy: -7, r: 10.5, fill: 'url(#va-lidar)' }, robot);
  el('circle', { cy: -7, r: 10.5, fill: 'none', stroke: '#2b2f39', 'stroke-width': 1.5 }, robot);
  const ring = el('circle', { cy: -7, r: 13.5, fill: 'none', stroke: a1, 'stroke-width': 1.6, opacity: 0 }, robot);
  el('rect', { x: -7.5, y: 10, width: 6, height: 3.4, rx: 1.7, fill: '#c7ccd6' }, robot);
  el('rect', { x: 1.5, y: 10, width: 6, height: 3.4, rx: 1.7, fill: '#c7ccd6' }, robot);
  const led = el('circle', { cx: 0, cy: 18, r: 1.6, fill: '#34d399' }, robot);

  const cl = (x: number) => Math.max(0, Math.min(1, x));
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const at = (len: number) => {
    const p = trail.getPointAtLength(Math.max(0, Math.min(LEN, len)));
    const q = trail.getPointAtLength(Math.max(0, Math.min(LEN, len + 2)));
    return { x: p.x, y: p.y, a: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 90 };
  };
  const place = (x: number, y: number, a: number) => robot.setAttribute('transform', `translate(${x} ${y}) rotate(${a})`);
  const turn = (from: number, to: number, k: number) => from + ((((to - from + 540) % 360) - 180) * k);
  const end = at(LEN);

  return (mode: Mode, t: number) => {
    brush.setAttribute('transform', `translate(19 -21) rotate(${t * 720})`);
    if (mode === 'start') {
      const wake = cl((t - 0.5) / 0.3);
      ring.setAttribute('opacity', (wake * (0.55 + 0.45 * Math.sin(t * 10))).toFixed(2));
      led.setAttribute('fill', wake > 0.5 ? a1 : '#34d399');
      halo.setAttribute('opacity', (wake * 0.9).toFixed(2));
      charge.setAttribute('opacity', ((1 - wake) * (0.5 + 0.5 * Math.sin(t * 6))).toFixed(2));
      const dist = ease(cl((t - 0.8) / 3.4)) * LEN * 0.62;
      const p = at(dist);
      place(p.x, p.y, t < 0.8 ? 90 : p.a);
      trail.style.strokeDashoffset = String(LEN - dist);
      for (const k of dust) {
        const dx = k.x - p.x;
        const dy = k.y - p.y;
        const near = Math.hypot(dx, dy);
        if (near < 22 && t > 0.8) k.gone = true;
        const pull = near < 38 && !k.gone;
        k.e.setAttribute('r', String(k.gone ? 0 : k.r));
        k.e.setAttribute('cx', String(pull ? p.x + dx * 0.8 : k.x));
        k.e.setAttribute('cy', String(pull ? p.y + dy * 0.8 : k.y));
      }
      return;
    }
    // Terminou: chão limpo, volta até a frente da base, gira e entra de ré
    trail.style.strokeDashoffset = '0';
    trailLine.setAttribute('opacity', '0.35');
    for (const k of dust) k.e.setAttribute('r', '0');
    const front = { x: 96, y: 125 };
    const head = (Math.atan2(front.y - end.y, front.x - end.x) * 180) / Math.PI + 90;
    const mv = ease(cl((t - 0.8) / 1.6));
    let x = end.x + (front.x - end.x) * mv;
    let a = turn(end.a, head, ease(cl((t - 0.45) / 0.35)));
    if (t > 2.4) a = turn(head, 90, ease(cl((t - 2.4) / 0.4)));
    let y = end.y + (front.y - end.y) * mv;
    if (t > 2.8) {
      x = front.x + (64 - front.x) * ease(cl((t - 2.8) / 0.4));
      y = front.y;
      a = 90;
    }
    place(x, y, a);
    ring.setAttribute('opacity', t < 3.1 ? '0.7' : '0');
    halo.setAttribute('opacity', t < 3.1 ? '0.7' : '0');
    const docked = cl((t - 3.2) / 0.3);
    charge.setAttribute('opacity', (docked * (0.55 + 0.45 * Math.sin(t * 5))).toFixed(2));
    led.setAttribute('fill', docked > 0.5 ? '#34d399' : a1);
    dockLed.setAttribute('opacity', docked > 0.5 ? (0.5 + 0.5 * Math.sin(t * 8)).toFixed(2) : '1');
    shine.setAttribute('opacity', (0.1 * cl((t - 3.2) / 0.6)).toFixed(3));
    for (const sp of sparkles) {
      const k = cl((t - 3.3 - sp.d * 0.9) / 0.7);
      const o = Math.sin(k * Math.PI);
      sp.g.setAttribute('opacity', o.toFixed(2));
      sp.g.setAttribute('transform', `translate(${sp.x} ${sp.y}) scale(${0.4 + o * 0.8}) rotate(${k * 90})`);
    }
  };
}

/**
 * Animação do aspirador: aparece quando um robô começa a limpar e quando termina e volta à base.
 * Disparada pelas mudanças em tempo real do Home Assistant (botão no app, voz, automação ou no próprio robô).
 * Some sozinha ao final ou ao tocar. No modo TV fica maior e centralizada.
 */
export function VacuumCelebration({ tv = false }: { tv?: boolean }) {
  const show = useVacuumShow((s) => s.queue[0]);
  const done = useVacuumShow((s) => s.done);
  const svgRef = useRef<SVGSVGElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show || !svgRef.current) return;
    const css = getComputedStyle(document.documentElement);
    const draw = buildScene(svgRef.current, css.getPropertyValue('--accent-1').trim() || '#22d3ee', css.getPropertyValue('--accent-2').trim() || '#8b5cf6');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const D = DURATION[show.mode];
    const t0 = performance.now();
    let raf = 0;
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const cl = (x: number) => Math.max(0, Math.min(1, x));
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      // Sem animação (acessibilidade): mostra o quadro final parado por alguns segundos
      draw(show.mode, reduce ? (show.mode === 'start' ? 3.6 : 4.4) : t);
      const k = ease(cl(t / 0.45)) - ease(cl((t - (D - 0.45)) / 0.45));
      if (sheetRef.current) sheetRef.current.style.transform = tv ? `translate(-50%, ${(1 - k) * 40}px) scale(${0.94 + k * 0.06})` : `translateY(${(1 - k) * 120}%)`;
      if (sheetRef.current && tv) sheetRef.current.style.opacity = String(k);
      if (dimRef.current) dimRef.current.style.opacity = String(0.9 * k);
      if (t < D) raf = requestAnimationFrame(frame);
      else done();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [show, done, tv]);

  if (!show) return null;
  const title = show.mode === 'start' ? `${show.name} começou a aspirar` : 'Casa limpa! ✨';
  const battery = show.battery !== null ? `bateria ${show.battery}%` : null;
  const sub =
    show.mode === 'start'
      ? [battery && battery.charAt(0).toUpperCase() + battery.slice(1), show.fan && `potência ${fanLabel(show.fan)}`].filter(Boolean).join(' · ')
      : `${show.name} terminou e voltou para a base${battery ? ` · ${battery}` : ''}`;

  return (
    <div className="fixed inset-0 z-[70]" onClick={done} role="status" aria-live="polite" aria-label={`${title}. ${sub}`}>
      <div ref={dimRef} className="absolute inset-0" style={{ background: 'rgba(3,5,10,.55)', opacity: 0 }} />
      <div
        ref={sheetRef}
        className="absolute overflow-hidden"
        style={{
          ...(tv ? { left: '50%', top: '9vh', width: 'min(720px, 66vw, calc((82vh - 190px) * 1.44))', opacity: 0 } : { left: 12, right: 12, bottom: 'max(14px, env(safe-area-inset-bottom))', transform: 'translateY(120%)', maxWidth: 520, margin: '0 auto' }),
          borderRadius: tv ? 40 : 30,
          background: 'linear-gradient(180deg,#171a28,#10121c)',
          border: '1px solid rgba(255,255,255,.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
        }}
      >
        <svg ref={svgRef} viewBox="0 0 360 250" style={{ display: 'block', width: '100%', height: 'auto' }} aria-hidden />
        <div style={{ padding: tv ? '4px 36px 34px' : '2px 22px 22px' }}>
          <p style={{ font: `700 ${tv ? 34 : 19}px var(--font-display, Sora, sans-serif)`, color: '#fff', margin: 0 }}>{title}</p>
          <p style={{ font: `500 ${tv ? 22 : 13.5}px Sora, sans-serif`, color: 'rgba(255,255,255,.55)', margin: '6px 0 0' }}>{sub}</p>
        </div>
      </div>
    </div>
  );
}
