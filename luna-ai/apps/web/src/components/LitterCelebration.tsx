import { useEffect } from 'react';
import { create } from 'zustand';
import type { LitterBoxDto } from '@luna/shared';
import './litterCelebration.css';

interface Show {
  id: number;
  catName: string | null;
  /** Foto do rosto do gato, se tiver */
  photo: string | null;
  at: string;
}

interface ShowState {
  queue: Show[];
  /** Última visita vista em cada caixa (a 1ª leitura só guarda, não comemora) */
  last: Record<string, string | null>;
  observe: (boxes: LitterBoxDto[]) => void;
  done: () => void;
}

let seq = 0;
/** Fila de comemorações: uma por visita nova registrada pela caixa de areia (como a do robô aspirador). */
export const useLitterShow = create<ShowState>((set, get) => ({
  queue: [],
  last: {},
  observe: (boxes) => {
    const seen = get().last;
    const shows: Show[] = [];
    const next: Record<string, string | null> = { ...seen };
    for (const b of boxes) {
      const v = b.lastVisit;
      next[b.id] = v?.id ?? null;
      if (!(b.id in seen) || !v || v.id === seen[b.id]) continue;
      // Só visita recente (a lista pode recarregar muito depois)
      if (Date.now() - Date.parse(v.at) > 5 * 60_000) continue;
      const cat = b.cats.find((c) => c.id === v.catId);
      shows.push({ id: ++seq, catName: v.catName, photo: cat?.photo ? `/api/litter/cats/${cat.id}/photo?v=${cat.photo}` : null, at: v.at });
    }
    set((s) => ({ last: next, queue: [...s.queue, ...shows].slice(-3) }));
  },
  done: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

const DURATION_MS = 5800;
const STAR = 'M12 0C13 9 15 11 24 12C15 13 13 15 12 24C11 15 9 13 0 12C9 11 11 9 12 0Z';
const SPARKS: [number, number, number, number][] = [[18, 72, 34, 2.3], [82, 70, 28, 2.45], [26, 58, 22, 2.6], [76, 55, 26, 2.7], [50, 48, 20, 2.85], [12, 50, 18, 2.95], [88, 45, 22, 3.05]];
const BUBBLES: [number, number, number][] = [[30, 22, 2.3], [40, 16, 2.5], [60, 20, 2.4], [70, 14, 2.6], [50, 18, 2.7]];

/** O gatinho sorrindo (desenho): sobe da caixinha, suspira e balança o rabo */
function Kitty() {
  return (
    <svg viewBox="0 0 220 230" className="lc-svg" aria-hidden>
      <g className="lc-tail">
        <path d="M150 200 C 205 190, 215 140, 190 110" stroke="#f2a65a" strokeWidth="18" fill="none" strokeLinecap="round" />
      </g>
      <ellipse cx="110" cy="190" rx="70" ry="50" fill="#f6b26b" />
      <ellipse cx="110" cy="200" rx="40" ry="30" fill="#fde2c4" />
      <g className="lc-head">
        <path d="M48 70 L58 18 L92 52 Z" fill="#f6b26b" />
        <path d="M56 60 L62 32 L80 50 Z" fill="#f9a8d4" />
        <path d="M172 70 L162 18 L128 52 Z" fill="#f6b26b" />
        <path d="M164 60 L158 32 L140 50 Z" fill="#f9a8d4" />
        <ellipse cx="110" cy="100" rx="72" ry="62" fill="#f8bd7e" />
        <path d="M70 60 q8 10 0 20 M90 50 q6 10 0 18 M130 50 q-6 10 0 18 M150 60 q-8 10 0 20" stroke="#e8954a" strokeWidth="5" fill="none" strokeLinecap="round" />
        <g className="lc-eyes">
          <path d="M74 102 q12 -14 24 0" stroke="#3b2a1a" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M122 102 q12 -14 24 0" stroke="#3b2a1a" strokeWidth="6" fill="none" strokeLinecap="round" />
        </g>
        <ellipse className="lc-blush" cx="70" cy="122" rx="14" ry="8" fill="#f9a8d4" />
        <ellipse className="lc-blush" cx="150" cy="122" rx="14" ry="8" fill="#f9a8d4" />
        <path d="M104 114 h12 l-6 7 z" fill="#e2777a" />
        <path d="M110 121 q-10 14 -20 4 M110 121 q10 14 20 4" stroke="#3b2a1a" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M40 112 h-26 M42 122 h-24 M180 112 h26 M178 122 h24" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      </g>
    </svg>
  );
}

/**
 * “Ahh, que alívio!”: quando um gato usa a caixa de areia, o gatinho sai da caixinha sorrindo,
 * suspira e a caixa brilha de limpa. Como a comemoração do robô: aparece em todos os aparelhos com a
 * Luna aberta (de baixo no celular/tablet, no centro na TV), some sozinha e um toque fecha.
 */
export function LitterCelebration({ tv = false }: { tv?: boolean }) {
  const show = useLitterShow((s) => s.queue[0]);
  const done = useLitterShow((s) => s.done);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(done, DURATION_MS);
    return () => clearTimeout(t);
  }, [show, done]);
  if (!show) return null;
  const hora = new Date(show.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const who = show.catName ?? 'Um gatinho';
  const sub = `${who} usou a caixa às ${hora} · a limpeza vem em seguida`;
  return (
    <div key={show.id} className={`lc-root ${tv ? 'tv' : ''}`} onClick={done} role="status" aria-live="polite" aria-label={`Ahh, que alívio! ${sub}`}>
      <div className="lc-dim" />
      <div className="lc-card">
        <div className="lc-stage">
          <div className="lc-mask">
            <div className="lc-cat">
              <Kitty />
            </div>
          </div>
          <div className="lc-box">
            <i className="lc-rim" />
            <i className="lc-body" />
            <span className="lc-shine">
              <i />
            </span>
          </div>
          <span className="lc-ahh">ahh~</span>
          {[0, 1, 2].map((k) => (
            <i key={k} className="lc-puff" style={{ left: `${22 + k * 3}%`, top: `${32 + k * 4}%`, animationDelay: `${1.8 + k * 0.2}s` }} />
          ))}
          {SPARKS.map(([x, y, s, d], k) => (
            <svg key={k} className="lc-spark" viewBox="0 0 24 24" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${d}s` }} aria-hidden>
              <path d={STAR} fill="#fff6c2" />
            </svg>
          ))}
          {BUBBLES.map(([x, s, d], k) => (
            <i key={k} className="lc-bub" style={{ left: `${x}%`, width: s, height: s, animationDelay: `${d}s` }} />
          ))}
        </div>
        <div className="lc-txt">
          <p className="lc-title">Ahh, que alívio! ✨</p>
          <p className="lc-sub">
            {show.photo ? <img src={show.photo} alt="" /> : <span className="lc-av">🐱</span>}
            {sub}
          </p>
        </div>
      </div>
    </div>
  );
}
