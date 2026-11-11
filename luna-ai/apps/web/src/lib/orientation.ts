import type { ScreenOrientationPref } from '../stores/settings';

type Lockable = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

/**
 * Aplica a orientação no app instalado (PWA). "auto" pede rotação livre ("any"),
 * o que também corrige instalações antigas que ficaram travadas em retrato.
 * Retorna uma mensagem de erro quando o navegador não permite.
 */
export async function applyOrientation(pref: ScreenOrientationPref): Promise<string | null> {
  const so = (screen as Screen & { orientation?: Lockable }).orientation;
  if (!so?.lock) return 'Este navegador não permite controlar a orientação (no iPhone, use o bloqueio de rotação do sistema).';
  try {
    await so.lock(pref === 'auto' ? 'any' : pref);
    return null;
  } catch {
    return 'A orientação só pode ser controlada com a Luna instalada (aberta pelo ícone, não pelo navegador).';
  }
}

export function currentOrientation(): string {
  const so = (screen as Screen & { orientation?: ScreenOrientation }).orientation;
  return so?.type ?? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
}
