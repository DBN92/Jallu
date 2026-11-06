import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { AssistantState } from '@luna/shared';
import { STATE_LABEL } from '../lib/text';
import { LunaOrb } from './LunaOrb';

/**
 * Conversa por voz em tela cheia: a onda cresce e ocupa a tela enquanto você fala com a DIA,
 * mostrando a transcrição e a resposta. Ao terminar, encolhe e some (animação de saída).
 */
export function VoiceFocus({
  open,
  state,
  levelRef,
  heard,
  reply,
  hint,
  onOrb,
  onClose,
}: {
  open: boolean;
  state: AssistantState;
  levelRef: { current: number };
  heard: string;
  reply: string;
  hint: string;
  onOrb: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const t = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, 450);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  if (!mounted) return null;
  const landscape = vp.w > vp.h * 1.15;
  const size = Math.round(Math.min(landscape ? vp.h * 0.78 : vp.w * 0.92, landscape ? vp.w * 0.5 : vp.h * 0.55, 560));

  return createPortal(
    <div className={`overlay-full z-[66] flex bg-ink-950/96 ${leaving ? 'focus-out' : 'focus-in'}`}>
      <button
        onClick={onClose}
        className="absolute top-[max(env(safe-area-inset-top),1rem)] right-4 z-10 rounded-sm border border-cyan-300/30 bg-ink-900/70 p-2.5 text-cyan-100/80 hover:border-cyan-300/60"
        aria-label="Encerrar conversa por voz"
      >
        <X className="h-5 w-5" />
      </button>
      <div className={`flex w-full flex-1 items-center justify-center gap-6 px-6 pt-safe pb-safe ${landscape ? 'flex-row' : 'flex-col'}`}>
        <div className="focus-orb">
          <LunaOrb state={state} levelRef={levelRef} size={size} onClick={onOrb} />
        </div>
        <div className={`flex max-w-xl flex-col gap-3 ${landscape ? 'items-start text-left' : 'items-center text-center'}`}>
          <p className="hud-label text-sm">{STATE_LABEL[state]}</p>
          {heard && <p className="font-hud text-xl text-cyan-100/70 italic md:text-2xl">“{heard}”</p>}
          {reply && <p className="text-lg leading-relaxed text-cyan-50 md:text-xl">{reply}</p>}
          {!heard && !reply && <p className="font-hud text-base text-cyan-100/50">{hint}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
