import { useEffect } from 'react';
import { useLocation as useRoute, useNavigate } from 'react-router-dom';
import { acquireScreen, releaseScreen } from '../lib/wakeLock';
import { useSettings } from '../stores/settings';

const IDLE_MS = 90_000;

/**
 * Modo assistente fixo (aparelho dedicado, ex.: Android na parede):
 * - tela sempre acesa enquanto a Luna estiver aberta;
 * - volta para a tela inicial após 90 s sem toques em outra página;
 * - ao reabrir o app (desbloqueio/voltar do segundo plano), mostra a tela inicial.
 */
export function useKioskMode() {
  const kiosk = useSettings((s) => s.kioskMode);
  const navigate = useNavigate();
  const route = useRoute();

  useEffect(() => {
    if (!kiosk) return;
    void acquireScreen();
    return () => releaseScreen();
  }, [kiosk]);

  useEffect(() => {
    if (!kiosk || route.pathname === '/') return;
    let timer = window.setTimeout(() => navigate('/'), IDLE_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => navigate('/'), IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [kiosk, route.pathname, navigate]);

  useEffect(() => {
    if (!kiosk) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') navigate('/');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [kiosk, navigate]);
}
