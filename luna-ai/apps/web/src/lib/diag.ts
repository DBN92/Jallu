/**
 * Diagnóstico: guarda o que a tela fez (em ordem) e manda para o servidor de tempos em tempos.
 * Serve para investigar problemas que só acontecem no tablet (ex.: tela preta no app Android).
 */
const queue: { t: number; msg: string }[] = [];
let timer: number | null = null;
const inApp = () => typeof window !== 'undefined' && !!(window as unknown as { DiaAndroid?: unknown }).DiaAndroid;

function flush() {
  timer = null;
  if (!queue.length) return;
  const events = queue.splice(0, 100);
  const csrf = decodeURIComponent(document.cookie.match(/(?:^|; )luna_csrf=([^;]+)/)?.[1] ?? '');
  void fetch('/api/diag', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ source: 'web', device: inApp() ? 'app-android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iphone' : /Android/.test(navigator.userAgent) ? 'android-navegador' : 'navegador', events }),
  }).catch(() => undefined);
}

export function diag(msg: string) {
  queue.push({ t: Date.now(), msg: msg.slice(0, 400) });
  if (queue.length > 300) queue.splice(0, queue.length - 300);
  timer ??= window.setTimeout(flush, 2000);
}

/** O que está por cima no meio da tela (mostra se algo cobriu tudo, por exemplo um fundo preto) */
function topElement() {
  const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) as HTMLElement | null;
  if (!el) return 'nada';
  const path: string[] = [];
  let e: HTMLElement | null = el;
  for (let i = 0; e && i < 4; i++, e = e.parentElement) path.push(`${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`);
  return path.join(' < ');
}

/** Começa o registro: erros, visibilidade, e o que está na tela nos primeiros 2 minutos */
export function startDiag(version: string) {
  if (inApp()) document.documentElement.classList.add('in-app');
  diag(`abriu · ${version} · ${navigator.userAgent.slice(0, 160)} · tela ${window.innerWidth}x${window.innerHeight}`);
  window.addEventListener('error', (e) => diag(`ERRO ${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => diag(`ERRO (promessa) ${String((e.reason as Error)?.message ?? e.reason).slice(0, 200)}`));
  document.addEventListener('visibilitychange', () => diag(`visibilidade: ${document.visibilityState}`));
  let n = 0;
  const peek = window.setInterval(() => {
    diag(`na tela (${(n + 1) * 3}s): ${topElement()}`);
    if (++n >= 40) clearInterval(peek);
  }, 3000);
  window.addEventListener('pagehide', flush);
}
