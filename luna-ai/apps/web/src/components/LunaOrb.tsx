import type { AssistantState } from '@luna/shared';

export function LunaOrb({ state, level = 0, size = 220, onClick }: { state: AssistantState; level?: number; size?: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Falar com a Luna"
      className="orb rounded-full outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40"
      data-state={state}
      style={{ ['--size' as string]: `${size}px`, ['--level' as string]: level } as React.CSSProperties}
    >
      <span className="halo" />
      <span className="core" />
      <span className="veil" />
      <span className="ring" />
    </button>
  );
}
