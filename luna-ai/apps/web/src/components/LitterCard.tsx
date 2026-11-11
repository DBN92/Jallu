import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LitterBoxDto } from '@luna/shared';
import { useLitter } from '../stores/litter';

/** Desenho da caixa de areia automática (frente), com uma luz de estado. */
export function LitterIcon({ size, glow = '#34d399' }: { size: number; glow?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="lt-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6fa" />
          <stop offset="1" stopColor="#c9ced8" />
        </linearGradient>
        <radialGradient id="lt-glow">
          <stop offset="0" stopColor={glow} stopOpacity=".45" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="52" r="48" fill="url(#lt-glow)" />
      <rect x="14" y="78" width="72" height="10" rx="4" fill="#aeb4bf" />
      <path d="M18 80 C18 30 82 30 82 80 Z" fill="url(#lt-body)" />
      <path d="M32 80 C32 52 68 52 68 80 Z" fill="#1c2030" />
      <path d="M36 80 C36 58 64 58 64 80" fill="none" stroke="#3a3f52" strokeWidth="2" />
      <rect x="44" y="34" width="12" height="3" rx="1.5" fill={glow} />
      <circle cx="50" cy="27" r="2" fill="#8a93a3" />
    </svg>
  );
}

export const litterColor = (b: LitterBoxDto) => (!b.available ? '#94a3b8' : b.status === 'clean' || b.status === 'level' || b.status === 'empty' ? '#22d3ee' : '#34d399');

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  if (m < 24 * 60) return `há ${Math.round(m / 60)} h`;
  return `há ${Math.round(m / 1440)} dias`;
};

export const kg = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`);

/** Cartão “Caixa de areia” na tela inicial (só aparece se houver caixa no Home Assistant). */
export function LitterCard() {
  const navigate = useNavigate();
  const { boxes, load, clean, busy } = useLitter();
  useEffect(() => {
    if (boxes === null) void load();
  }, [boxes, load]);
  if (!boxes?.length) return null;
  return (
    <>
      {boxes.map((b) => {
        const today = b.week.at(-1)?.count ?? b.todayCount ?? 0;
        return (
          <div key={b.id} className="m-card" style={{ padding: 16 }}>
            <p className="m-label mb-3">Caixa de areia</p>
            <button className="flex w-full items-center gap-3.5 text-left" onClick={() => navigate(`/caixa-de-areia/${b.id}`)} aria-label="Abrir caixa de areia">
              <LitterIcon size={66} glow={litterColor(b)} />
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold">{b.name}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.available ? 'bg-emerald-400/15 text-emerald-100' : 'bg-white/10 text-white/60'}`}>{b.statusLabel}</span>
                  {b.lastVisit && (
                    <span className="m-muted text-[12.5px]">
                      última visita {ago(b.lastVisit.at)}
                      {b.lastVisit.weightKg !== null ? ` · ${kg(b.lastVisit.weightKg)}` : ''}
                    </span>
                  )}
                </span>
              </span>
            </button>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <div>
                <p className="m-muted mb-1 text-xs">Visitas hoje</p>
                <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  {today}
                </p>
              </div>
              {b.autoClean !== null && (
                <div>
                  <p className="m-muted mb-1 text-xs">Limpeza automática</p>
                  <p className={`text-sm ${b.autoClean ? 'text-emerald-200' : 'text-amber-200'}`}>{b.autoClean ? 'ligada' : 'desligada'}</p>
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              {b.canClean && (
                <button className="m-chip act flex-[1.3] justify-center disabled:opacity-40" disabled={busy || !b.available} onClick={() => void clean(b.id)}>
                  🧹 Limpar agora
                </button>
              )}
              <button className="m-chip flex-1 justify-center" onClick={() => navigate(`/caixa-de-areia/${b.id}`)}>
                Mais opções
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
