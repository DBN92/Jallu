import { Check } from 'lucide-react';
import { THEMES } from '../lib/theme';
import { useSettings } from '../stores/settings';

/** Ajustes › Tema: troca o visual do app inteiro (fica salvo neste aparelho). */
export function ThemePicker() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  return (
    <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
      {THEMES.map((t) => {
        const [bg, card, a, b] = t.swatch;
        const on = theme === t.id;
        const hud = t.id === 'hud';
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            aria-pressed={on}
            className={`relative overflow-hidden text-left transition active:scale-[0.98] ${on ? 'ring-2' : 'ring-1'}`}
            style={{ borderRadius: hud ? 4 : 20, background: bg, ['--tw-ring-color' as string]: on ? a : 'rgba(255,255,255,0.12)' }}
          >
            {/* Miniatura do tema */}
            <div className="relative h-24 overflow-hidden" style={{ background: hud ? `linear-gradient(${bg},#06202e)` : `radial-gradient(120px 90px at 0% 0%, ${a}55, transparent 70%), radial-gradient(140px 100px at 100% 60%, ${b}55, transparent 70%), ${bg}` }}>
              <div className="absolute top-3 left-3 h-[60px] w-[46%] p-2" style={{ background: card, border: `1px solid ${hud ? a + '55' : 'rgba(255,255,255,0.1)'}`, borderRadius: hud ? 2 : 14, clipPath: hud ? 'polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)' : undefined }}>
                <svg viewBox="0 0 100 30" className="h-full w-full">
                  <defs>
                    <linearGradient id={`g-${t.id}`} x1="0" x2="1">
                      <stop offset="0" stopColor={a} />
                      <stop offset="1" stopColor={b} />
                    </linearGradient>
                  </defs>
                  <path d="M2 15 C 20 15, 25 3, 40 12 S 60 28, 75 14 S 92 15, 98 15" fill="none" stroke={`url(#g-${t.id})`} strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <div className="absolute top-3 right-3 grid w-[38%] grid-cols-2 gap-1.5">
                {[1, 0, 0, 1].map((x, i) => (
                  <i key={i} className="block h-[27px]" style={{ background: x ? (hud ? '#ffb54755' : `${b}66`) : card, border: `1px solid ${hud ? a + '44' : 'rgba(255,255,255,0.08)'}`, borderRadius: hud ? 1 : 8 }} />
                ))}
              </div>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 px-2 py-1" style={{ background: hud ? 'transparent' : 'rgba(255,255,255,0.08)', borderRadius: 99 }}>
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} className="block h-1.5 w-1.5 rounded-full" style={{ background: i ? 'rgba(255,255,255,0.35)' : a }} />
                ))}
              </div>
            </div>
            <div className="px-3.5 py-3">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-white">
                {t.name}
                {on && (
                  <span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: a, color: bg }}>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-white/55">{t.desc}</p>
              <p className="mt-1 text-[11px] text-white/35">Fontes: {t.fonts}</p>
            </div>
          </button>
        );
      })}
      <p className="text-xs text-white/40 sm:col-span-2">O tema muda o app inteiro (tela inicial, casa, câmeras, ajustes e modo TV) e fica salvo neste aparelho.</p>
    </div>
  );
}
