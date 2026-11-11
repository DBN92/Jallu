import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WasherDto } from '@luna/shared';
import { useWasher } from '../stores/washer';

/** Desenho da lava e seca (frente): painel, porta redonda e água girando quando está lavando. */
export function WasherIcon({ size, spinning = false, water = true, glow }: { size: number; spinning?: boolean; water?: boolean; glow?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="wa-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f7fb" />
          <stop offset="1" stopColor="#cfd4de" />
        </linearGradient>
        <radialGradient id="wa-glass" cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#4a5163" />
          <stop offset="1" stopColor="#1a1d27" />
        </radialGradient>
        <linearGradient id="wa-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-1, #22d3ee)" />
          <stop offset="1" stopColor="var(--accent-2, #8b5cf6)" />
        </linearGradient>
        {glow && (
          <radialGradient id="wa-glow">
            <stop offset="0" stopColor={glow} stopOpacity=".45" />
            <stop offset="1" stopColor={glow} stopOpacity="0" />
          </radialGradient>
        )}
        <clipPath id="wa-door">
          <circle cx="50" cy="58" r="22" />
        </clipPath>
      </defs>
      {glow && <circle cx="50" cy="54" r="48" fill="url(#wa-glow)" />}
      <rect x="18" y="10" width="64" height="80" rx="10" fill="url(#wa-body)" />
      <rect x="18" y="10" width="64" height="16" rx="10" fill="#e9ecf2" />
      <rect x="25" y="16" width="14" height="4" rx="2" fill="#1f2937" />
      <rect x="27" y="17" width="6" height="2" rx="1" fill="var(--accent-1, #22d3ee)" />
      <circle cx="66" cy="18" r="2.4" fill="#9aa3b2" />
      <circle cx="73" cy="18" r="3.2" fill="#b6bdc9" />
      <circle cx="50" cy="58" r="26" fill="#aab1bd" />
      <circle cx="50" cy="58" r="22" fill="url(#wa-glass)" />
      {water && (
        <g clipPath="url(#wa-door)">
          <g className={spinning ? 'washer-spin' : undefined} style={{ transformOrigin: '50px 58px' }}>
            <path d="M24 62 C34 56 42 66 50 61 C58 56 66 66 76 60 L76 84 L24 84 Z" fill="url(#wa-water)" opacity=".85" />
            <circle cx="43" cy="68" r="2" fill="#fff" opacity=".7" />
            <circle cx="57" cy="72" r="1.5" fill="#fff" opacity=".6" />
          </g>
        </g>
      )}
      <path d="M36 44 A20 20 0 0 1 58 39" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export const hourOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const mins = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? (r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`) : `${r} min`;
};

/** “faltam 42 min · termina 15:20” / “programa de 35 min” / “terminou às 15:20” */
export function washerLine(w: WasherDto) {
  if (!w.available) return 'sem resposta da máquina';
  if (!w.power) return w.lastDoneAt ? `último ciclo terminou às ${hourOf(w.lastDoneAt)}` : 'desligada';
  if (w.status === 'end') return w.lastDoneAt ? `terminou às ${hourOf(w.lastDoneAt)}` : 'ciclo terminado';
  if (w.remainingMin === null) return '';
  if (w.status === 'start') return `faltam ${mins(w.remainingMin)}${w.endsAt ? ` · termina ${hourOf(w.endsAt)}` : ''}`;
  if (w.status === 'pause') return `pausada · faltam ${mins(w.remainingMin)}`;
  return `${w.program ? `${w.program} · ` : ''}programa de ${mins(w.remainingMin)}`;
}

export const washerTone = (w: WasherDto) =>
  !w.available || !w.power ? 'bg-white/10 text-white/60' : w.status === 'fault' ? 'bg-rose-400/15 text-rose-100' : w.status === 'end' ? 'bg-emerald-400/15 text-emerald-100' : w.status === 'pause' ? 'bg-amber-400/15 text-amber-100' : 'bg-cyan-400/15 text-cyan-100';

/** Barra de etapas: Lavar · Enxaguar · Centrifugar (· Secar). */
export function WasherSteps({ w }: { w: WasherDto }) {
  return (
    <div className="flex gap-1.5">
      {w.steps.map((s) => (
        <div key={s.key} className="flex-1 text-center">
          <div
            className={`h-1.5 rounded-full ${s.state === 'current' ? 'washer-pulse' : ''}`}
            style={{ background: s.state === 'todo' ? 'rgba(255,255,255,.12)' : s.state === 'current' ? 'linear-gradient(90deg,var(--accent-1),rgba(255,255,255,.18))' : 'linear-gradient(90deg,var(--accent-1),var(--accent-2))' }}
          />
          <p className={`mt-1.5 text-[11.5px] ${s.state === 'current' ? 'font-semibold' : 'm-muted opacity-70'}`}>{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Cartão “Lava e seca” na tela inicial (só aparece se a máquina estiver no Home Assistant). */
export function WasherCard() {
  const navigate = useNavigate();
  const { washers, load } = useWasher();
  useEffect(() => {
    if (washers === null) void load();
  }, [washers, load]);
  if (!washers?.length) return null;
  return (
    <>
      {washers.map((w) => {
        const active = w.status === 'start' || w.status === 'pause' || w.status === 'end';
        return (
          <div key={w.id} className="m-card" style={{ padding: 16 }}>
            <p className="m-label mb-3">Lava e seca</p>
            <button className="flex w-full items-center gap-3.5 text-left" onClick={() => navigate(`/lava-e-seca/${w.id}`)} aria-label="Abrir lava e seca">
              <WasherIcon size={66} spinning={w.status === 'start'} water={w.power} />
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold">{w.name}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${washerTone(w)}`}>{w.statusLabel}</span>
                </span>
                {washerLine(w) && <span className="m-muted mt-1.5 block text-[12.5px]">{washerLine(w)}</span>}
              </span>
            </button>
            {active && w.power && (
              <div className="mt-3.5">
                <WasherSteps w={w} />
              </div>
            )}
            <button className="m-chip mt-3 w-full justify-center" onClick={() => navigate(`/lava-e-seca/${w.id}`)}>
              Mais opções
            </button>
          </div>
        );
      })}
    </>
  );
}
