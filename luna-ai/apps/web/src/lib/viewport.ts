/**
 * Mantém a altura do app igual à área visível real (window.innerHeight), atualizando ao
 * girar, ao abrir/fechar o teclado e ao voltar do segundo plano. Evita alturas “fantasmas”
 * de 100vh no Safari/PWA do iPhone.
 */
export function installViewportFix() {
  const root = document.documentElement;
  const apply = () => root.style.setProperty('--app-h', `${window.innerHeight}px`);
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && apply());
}
