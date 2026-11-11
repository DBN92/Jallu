import { useEffect } from 'react';
import { create } from 'zustand';
import { nativeApp } from '../lib/native';
import { WasherIcon } from './WasherCard';

interface DoneState {
  text: string | null;
  show: (text: string, speech: string, speak: boolean) => void;
  close: () => void;
}

/** Aviso “Roupa pronta!” (chega do servidor quando a lava e seca termina). */
export const useWasherDone = create<DoneState>((set) => ({
  text: null,
  show: (text, speech, speak) => {
    set({ text });
    // Fala só no app Android (tablet): o celular e a TV mostram o aviso sem som
    const app = nativeApp();
    if (speak && app?.speak) {
      try {
        app.speak(speech);
      } catch {
        /* versão antiga do app */
      }
    }
  },
  close: () => set({ text: null }),
}));

/** Cartão por cima da tela; some sozinho depois de 25 s (na TV, 40 s) ou ao tocar. */
export function WasherDone({ tv = false }: { tv?: boolean }) {
  const { text, close } = useWasherDone();
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(close, tv ? 40_000 : 25_000);
    return () => clearTimeout(t);
  }, [text, close, tv]);
  if (!text) return null;
  const detail = text.replace(/^👕\s*Roupa pronta!\s*/, '');
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center" onClick={close} role="alertdialog" aria-label="Roupa pronta">
      <div className="washer-pop w-full max-w-sm overflow-hidden text-left" style={{ background: 'var(--card, rgba(8,24,36,.95))', border: '1px solid var(--line, rgba(0,229,255,.18))', borderRadius: 'var(--card-r, 24px)', transform: tv ? 'scale(1.25)' : undefined }}>
        <div className="flex justify-center py-5" style={{ background: 'radial-gradient(circle at 50% 60%, rgba(52,211,153,.28), transparent 65%)' }}>
          <WasherIcon size={tv ? 140 : 112} water={false} glow="#34d399" />
        </div>
        <div className="px-5 pb-5">
          <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Roupa pronta! <span className="washer-shirt">👕</span>
          </p>
          <p className="m-muted mt-1.5 text-[14px] opacity-80">{detail}</p>
          <button className="m-chip act mt-4 w-full justify-center" onClick={close}>
            Ok
          </button>
        </div>
      </div>
    </div>
  );
}
