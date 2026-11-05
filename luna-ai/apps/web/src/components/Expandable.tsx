import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const DURATION = 420;
const EASE = 'cubic-bezier(0.2, 0.85, 0.25, 1)';

/**
 * Painel HUD que, ao ser tocado, “voa” do seu lugar até o centro da tela e amplia
 * (técnica FLIP: só transform/opacity, animado pela GPU). Toque fora, ✕ ou Esc fecham,
 * e ele volta encolhendo para a posição original.
 */
export function ExpandablePanel({
  title,
  code,
  children,
  expanded,
  className = '',
  style,
}: {
  title: string;
  code?: string;
  /** Conteúdo compacto (no painel) */
  children: ReactNode;
  /** Conteúdo ampliado (no centro da tela) */
  expanded: () => ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<DOMRect | null>(null);

  const open = () => {
    if (!ref.current || origin) return;
    setOrigin(ref.current.getBoundingClientRect());
  };

  return (
    <>
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={`Ampliar ${title}`}
        onClick={(e) => {
          // Botões internos (ex.: ligar uma luz) não abrem o painel
          if ((e.target as HTMLElement).closest('[data-no-expand]')) return;
          open();
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
        className={`hud-panel cursor-pointer p-4 transition-[box-shadow,border-color] duration-200 hover:border-cyan-300/50 hover:shadow-[0_0_24px_rgba(0,229,255,0.15)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/60 ${className}`}
        style={{ ...style, opacity: origin ? 0 : 1 }}
      >
        <PanelHeader title={title} code={code} />
        {children}
      </div>
      {origin && <ExpandedCard title={title} code={code} origin={origin} onClosed={() => setOrigin(null)} sourceRef={ref}>{expanded()}</ExpandedCard>}
    </>
  );
}

export function PanelHeader({ title, code }: { title: string; code?: string }) {
  return (
    <header className="mb-3 flex items-center justify-between gap-2">
      <p className="hud-label">{title}</p>
      {code && <span className="hud-label text-cyan-300/40">{code}</span>}
    </header>
  );
}

function ExpandedCard({
  title,
  code,
  origin,
  onClosed,
  sourceRef,
  children,
}: {
  title: string;
  code?: string;
  origin: DOMRect;
  onClosed: () => void;
  sourceRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  /** Transformação que leva o cartão grande (centralizado) até o retângulo do painel original. */
  const toOrigin = (from: DOMRect) => {
    const el = card.current!;
    const r = el.getBoundingClientRect();
    const sx = from.width / r.width;
    const sy = from.height / r.height;
    return `translate(${from.left - r.left}px, ${from.top - r.top}px) scale(${sx}, ${sy})`;
  };

  // Entrada: começa exatamente sobre o painel e anima até o centro
  useLayoutEffect(() => {
    const el = card.current;
    const bd = backdrop.current;
    if (!el || !bd) return;
    el.style.transformOrigin = 'top left';
    el.style.transition = 'none';
    el.style.transform = toOrigin(origin);
    el.style.opacity = '0.6';
    bd.style.opacity = '0';
    void el.offsetWidth; // força o navegador a aplicar o estado inicial
    el.style.transition = `transform ${DURATION}ms ${EASE}, opacity ${DURATION}ms ease`;
    bd.style.transition = `opacity ${DURATION}ms ease`;
    el.style.transform = 'none';
    el.style.opacity = '1';
    bd.style.opacity = '1';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = card.current;
    const bd = backdrop.current;
    // Volta para onde o painel está AGORA (pode ter mudado com rolagem/rotação)
    const target = sourceRef.current?.getBoundingClientRect() ?? origin;
    if (el && bd) {
      el.style.transform = toOrigin(target);
      el.style.opacity = '0.4';
      bd.style.opacity = '0';
    }
    setTimeout(onClosed, DURATION - 40);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div ref={backdrop} className="overlay-full z-[64] flex items-center justify-center bg-ink-950/80 p-4" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="hud-panel flex max-h-[86%] w-full max-w-2xl flex-col p-5 shadow-[0_0_60px_rgba(0,229,255,0.18)] will-change-transform md:p-7"
      >
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="hud-label">{code ? `${code} · ` : ''}painel ampliado</p>
            <h2 className="hud-title hud-glow mt-1 text-lg font-bold text-cyan-50 uppercase md:text-xl">{title}</h2>
          </div>
          <button onClick={close} className="rounded-sm border border-cyan-300/30 bg-ink-900/70 p-2 text-cyan-100/80 hover:border-cyan-300/60" aria-label="Fechar painel">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
