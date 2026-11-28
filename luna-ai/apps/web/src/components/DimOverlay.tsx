import { createPortal } from 'react-dom';
import { usePresenceStore } from '../hooks/usePresence';

/** Tela escurecida quando não há ninguém por perto (no app Android o brilho também baixa). Toque acende. */
export function DimOverlay() {
  const dimmed = usePresenceStore((s) => s.dimmed);
  if (!dimmed) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[95] cursor-none bg-black"
      role="button"
      aria-label="Acender a tela"
      onPointerDown={(e) => {
        e.preventDefault();
        usePresenceStore.getState().setDimmed(false);
      }}
    />,
    document.body,
  );
}
