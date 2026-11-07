import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { Layout } from './components/Layout';
import { Button, Spinner } from './components/ui';
import { LunaOrb } from './components/LunaOrb';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import { onUnauthorized } from './services/api';
import { LunaSocket } from './services/socket';
import { useAssistant } from './stores/assistant';
import { useAuth } from './stores/auth';
import { useDevices } from './stores/devices';
import { tvActive, useSettings } from './stores/settings';
import { useTv } from './stores/tv';
import { GestureToast, useGestureToast, useGestureWatcher } from './gestures/useGestureWatcher';
import { VacuumCelebration, useVacuumShow } from './components/VacuumCelebration';
import { eventEmoji, useWatches } from './stores/watches';
import { applyOrientation } from './lib/orientation';

const ConversationsPage = lazy(() => import('./pages/ConversationsPage'));
const HousePage = lazy(() => import('./pages/HousePage'));
const WeatherPage = lazy(() => import('./pages/WeatherPage'));
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CamerasPage = lazy(() => import('./pages/CamerasPage'));
const TvApp = lazy(() => import('./tv/TvApp'));

/** Recarrega os aparelhos e guarda a fase atual dos aspiradores (base para detectar começou/terminou). */
const loadDevices = () => useDevices.getState().load(true).then(() => useVacuumShow.getState().seed(Object.values(useDevices.getState().devices)));

function useRealtimeConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const socket = new LunaSocket(
      (e) => {
        if (e.type === 'device_state') {
          useVacuumShow.getState().observe(e.device); // animação quando o robô começa ou termina
          useDevices.getState().upsert(e.device);
        } else if (e.type === 'devices_reload') void loadDevices();
        else if (e.type === 'ha_status') useDevices.getState().setHa(e.connected);
        else if (e.type === 'assistant_state') {
          useTv.getState().setRemoteState(e.state);
          if (e.state === 'acting') useAssistant.getState().setState('acting');
        } else if (e.type === 'assistant_reply') useTv.getState().pushReply(e);
        else if (e.type === 'camera_event') {
          // Garagem: aviso em todas as telas abertas (celular, tablet, TV)
          useWatches.getState().push(e.event);
          useGestureToast.getState().show(`${eventEmoji(e.event)} ${e.event.title}`, e.event.kind !== 'alert');
        }
      },
      (c) => useAssistant.getState().setServerConnected(c),
    );
    socket.start();
    return () => socket.stop();
  }, [enabled]);
}

function Splash() {
  return (
    <div className="app-bg flex h-full items-center justify-center">
      <LunaOrb state="processing" size={96} />
    </div>
  );
}

export default function App() {
  const { status, check, expire } = useAuth();
  const loadSettings = useSettings((s) => s.load);

  useEffect(() => {
    void check();
    return onUnauthorized(expire);
  }, [check, expire]);

  useEffect(() => {
    if (status === 'ready') {
      void loadSettings().catch(() => undefined);
      void loadDevices();
    }
  }, [status, loadSettings]);

  useRealtimeConnection(status === 'ready');
  useGestureWatcher(status === 'ready');

  // Orientação da tela (app instalado): reaplica ao abrir e ao voltar do segundo plano
  const orientation = useSettings((s) => s.orientation);
  const tv = tvActive(useSettings((s) => s.tvMode));
  useEffect(() => {
    void applyOrientation(orientation);
    const onVis = () => document.visibilityState === 'visible' && void applyOrientation(orientation);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [orientation]);

  if (status === 'loading') return <Splash />;
  if (status === 'offline') {
    return (
      <div className="app-bg flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff className="h-10 w-10 text-rose-300" />
        <p className="text-lg font-medium">Não consegui falar com o servidor da DIA</p>
        <p className="max-w-sm text-sm text-white/50">Verifique sua internet ou se o servidor está ligado. Fora de casa, o acesso passa pelo Cloudflare Tunnel.</p>
        <Button onClick={() => void check()}>Tentar novamente</Button>
      </div>
    );
  }
  if (status === 'setup' || status === 'login') return <LoginPage mode={status} />;
  if (tv)
    return (
      <Suspense fallback={<Splash />}>
        <TvApp />
        <GestureToast />
        <VacuumCelebration tv />
      </Suspense>
    );

  return (
    <BrowserRouter>
      <GestureToast />
      <VacuumCelebration />
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="conversas" element={<ConversationsPage />} />
            <Route path="casa" element={<HousePage />} />
            <Route path="cameras" element={<CamerasPage />} />
            <Route path="clima" element={<WeatherPage />} />
            <Route path="memoria" element={<MemoryPage />} />
            <Route path="automacoes" element={<AutomationsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
