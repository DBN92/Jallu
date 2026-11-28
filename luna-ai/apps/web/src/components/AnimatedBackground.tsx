import { useEffect, useRef } from 'react';
import { useSettings } from '../stores/settings';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/**
 * Fundo holográfico animado: partículas que se conectam como uma constelação.
 * Leve para aparelhos antigos: ~30 fps, quantidade proporcional à tela, pausa em segundo plano
 * e respeita “reduzir movimento”.
 */
export function AnimatedBackground() {
  // Temas modernos têm fundo estático (mais leve e sem redesenhar a tela inteira a cada quadro)
  const hud = useSettings((s) => s.theme) === 'hud';
  return hud ? <ParticlesCanvas /> : null;
}

function ParticlesCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Fundo discreto: resolução 1x basta e economiza muito no celular
    const dpr = 1;
    let w = 0;
    let h = 0;
    let particles: Particle[] = [];
    let raf = 0;
    let last = performance.now();
    let link2 = 0;

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(55, Math.max(18, (w * h) / 26000)));
      const link = Math.min(130, Math.max(85, w / 9));
      link2 = link * link;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 9, // px por segundo (movimento independente do fps)
        vy: (Math.random() - 0.5) * 9,
        r: Math.random() * 1.4 + 0.5,
      }));
    };

    // Linhas agrupadas em 3 faixas de opacidade: poucos stroke() por quadro
    const buckets = [new Path2D(), new Path2D(), new Path2D()];
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;
      }
      buckets[0] = new Path2D();
      buckets[1] = new Path2D();
      buckets[2] = new Path2D();
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]!;
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < link2) {
            const bucket = d2 < link2 * 0.25 ? 2 : d2 < link2 * 0.6 ? 1 : 0;
            buckets[bucket]!.moveTo(a.x, a.y);
            buckets[bucket]!.lineTo(b.x, b.y);
          }
        }
      }
      ctx.lineWidth = 0.6;
      [0.035, 0.07, 0.11].forEach((alpha, i) => {
        ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
        ctx.stroke(buckets[i]!);
      });
      const dots = new Path2D();
      for (const p of particles) {
        dots.moveTo(p.x + p.r, p.y);
        dots.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      }
      ctx.fillStyle = 'rgba(120, 240, 255, 0.5)';
      ctx.fill(dots);
    };

    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (document.visibilityState === 'visible' && !reduce) raf = requestAnimationFrame(loop);
    };

    resize();
    draw(0);
    if (!reduce) raf = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <canvas ref={ref} className="h-full w-full" style={{ transform: 'translateZ(0)' }} />
      <div className="hud-beam" />
    </div>
  );
}
