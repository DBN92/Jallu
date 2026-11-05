/**
 * Corrige a altura do app instalado no iPhone. Em alguns iOS (PWA em tela cheia),
 * window.innerHeight/100vh informam uma altura MENOR que a tela, deixando um vão
 * abaixo da barra de navegação. Aqui usamos a maior altura confiável disponível.
 */
export function installViewportFix() {
  const root = document.documentElement;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

  const apply = () => {
    let h = window.innerHeight;
    if (isIOS && standalone) {
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      // No app instalado não há barras do Safari: a tela inteira pertence ao app
      if (screenH > h) h = screenH;
    }
    root.style.setProperty('--app-h', `${h}px`);
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
  window.visualViewport?.addEventListener('resize', apply);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && apply());
}
