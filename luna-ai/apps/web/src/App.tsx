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
import { useSettings } from './stores/settings';
import { applyOrientation } from './lib/orientation';

const ConversationsPage = lazy(() => import('./pages/ConversationsPage'));
const HousePage = lazy(() => import('./pages/HousePage'));
const WeatherPage = lazy(() => import('./pages/WeatherPage'));
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function useRealtimeConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const socket = new LunaSocket(
      (e) => {
        if (e.type === 'device_state') useDevices.getState().upsert(e.device);
        else if (e.type === 'devices_reload') void useDevices.getState().load(true);
        else if (e.type === 'ha_status') useDevices.getState().setHa(e.connected);
        else if (e.type === 'assistant_state' && e.state === 'acting') useAssistant.getState().setState('acting');
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
      void useDevices.getState().load(true);
    }
  }, [status, loadSettings]);

  useRealtimeConnection(status === 'ready');

  // Orientação da tela (app instalado): reaplica ao abrir e ao voltar do segundo plano
  const orientation = useSettings((s) => s.orientation);
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
        <p className="text-lg font-medium">Não consegui falar com o servidor da Luna</p>
        <p className="max-w-sm text-sm text-white/50">Verifique sua internet ou se o servidor está ligado. Fora de casa, o acesso passa pelo Cloudflare Tunnel.</p>
        <Button onClick={() => void check()}>Tentar novamente</Button>
      </div>
    );
  }
  if (status === 'setup' || status === 'login') return <LoginPage mode={status} />;

  return (
    <BrowserRouter>
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
