type Sentinel = { release: () => Promise<void>; addEventListener?: (t: string, cb: () => void) => void };
let sentinel: Sentinel | null = null;
let wanted = 0;

/** Mantém a tela acesa (Screen Wake Lock API). Seguro chamar várias vezes. */
export async function acquireScreen() {
  wanted++;
  await reacquire();
}

async function reacquire() {
  if (sentinel || wanted <= 0 || document.visibilityState !== 'visible') return;
  try {
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    sentinel = await nav.wakeLock.request('screen');
    sentinel.addEventListener?.('release', () => (sentinel = null));
  } catch {
    /* não suportado / negado */
  }
}

export function releaseScreen() {
  wanted = Math.max(0, wanted - 1);
  if (wanted === 0 && sentinel) {
    void sentinel.release().catch(() => undefined);
    sentinel = null;
  }
}

// O navegador solta o bloqueio quando o app vai para segundo plano; recupera ao voltar
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => void reacquire());
}
