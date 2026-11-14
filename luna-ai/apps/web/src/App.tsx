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
import { useCameras } from './stores/cameras';
import { useRecados } from './stores/recados';
import { useLists } from './stores/lists';
import { nativeApp } from './lib/native';
import { RecadosLayer } from './components/Recados';
import { DimOverlay } from './components/DimOverlay';
import { usePresence } from './hooks/usePresence';
import { useTv } from './stores/tv';
import { GestureToast, useGestureToast, useGestureWatcher } from './gestures/useGestureWatcher';
import { VacuumCelebration, useVacuumShow } from './components/VacuumCelebration';
import { reloadLitter } from './stores/litter';
import { reloadWasher } from './stores/washer';
import { WasherDone, useWasherDone } from './components/WasherDone';
import { eventEmoji, useWatches } from './stores/watches';
import { applyOrientation } from './lib/orientation';

const ConversationsPage = lazy(() => import('./pages/ConversationsPage'));
const HousePage = lazy(() => import('./pages/HousePage'));
const WeatherPage = lazy(() => import('./pages/WeatherPage'));
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const ListsPage = lazy(() => import('./pages/ListsPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CamerasPage = lazy(() => import('./pages/CamerasPage'));
const VacuumPage = lazy(() => import('./pages/VacuumPage'));
const LitterPage = lazy(() => import('./pages/LitterPage'));
const WasherPage = lazy(() => import('./pages/WasherPage'));
const House3DPage = lazy(() => import('./pages/House3DPage'));
const TvApp = lazy(() => import('./tv/TvApp'));

/** Recarrega os aparelhos e guarda a fase atual dos aspiradores (base para detectar começou/terminou). */
const loadDevices = () => useDevices.getState().load(true).then(() => useVacuumShow.getState().seed(Object.values(useDevices.getState().devices)));

/** Quando o app Android ouviu um pedido por voz neste aparelho pela última vez */
let nativeVoiceAt = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('dia-native-voice', (e) => {
    if ((e as CustomEvent<{ state: string }>).detail?.state !== 'idle') nativeVoiceAt = Date.now();
  });
}

function useRealtimeConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const socket = new LunaSocket(
      (e) => {
        if (e.type === 'device_state') {
          useVacuumShow.getState().observe(e.device); // animação quando o robô começa ou termina
          useDevices.getState().upsert(e.device);
        } else if (e.type === 'devices_reload') void loadDevices();
        else if (e.type === 'litter_update') reloadLitter();
        else if (e.type === 'litter_alert') useGestureToast.getState().show(e.text, false);
        else if (e.type === 'recados_update') void useRecados.getState().load();
        else if (e.type === 'lists_update') void useLists.getState().load();
        else if (e.type === 'washer_update') reloadWasher();
        else if (e.type === 'washer_done') {
          reloadWasher();
          useWasherDone.getState().show(e.text, e.speech, e.speak);
        }
        else if (e.type === 'ha_status') useDevices.getState().setHa(e.connected);
        else if (e.type === 'assistant_state') {
          useTv.getState().setRemoteState(e.state);
          if (e.state === 'acting') useAssistant.getState().setState('acting');
        } else if (e.type === 'assistant_reply') {
          useTv.getState().pushReply(e);
          // Pedido feito pelo “Oi, Luna” do app Android: a resposta chega ao app só em texto, então é
          // por aqui que a tela fica sabendo que deve abrir a câmera (só no aparelho que ouviu o pedido).
          const here = Date.now() - nativeVoiceAt < 120_000;
          if (e.cameraIds.length && here) useCameras.getState().open(e.cameraIds);
          if (e.open && here) useRecados.getState().open(e.open === 'recorder' ? 'recorder' : 'player');
        }
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
  usePresence(status === 'ready');
  useEffect(() => {
    nativeApp()?.setDim?.(false);
  }, []);
  useEffect(() => {
    if (status !== 'ready') return;
    // Aberto pelo aviso do celular (“/?recado=…”): mostra o recado
    const openFrom = async (search: string) => {
      if (!new URLSearchParams(search).get('recado')) return;
      await useRecados.getState().load();
      useRecados.getState().open('player');
    };
    const first = location.search;
    void useRecados.getState().load().then(() => openFrom(first));
    if (new URLSearchParams(first).has('recado')) history.replaceState(null, '', location.pathname);
    // App já aberto quando tocou no aviso
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type === 'luna-open' && d.url) void openFrom(new URL(d.url, location.origin).search);
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, [status]);

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
        <p className="text-lg font-medium">Não consegui falar com o servidor da Luna</p>
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
        <WasherDone tv />
      </Suspense>
    );

  return (
    <BrowserRouter>
      <GestureToast />
      <RecadosLayer />
      <DimOverlay />
      <VacuumCelebration />
      <WasherDone />
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
            <Route path="casa/3d" element={<House3DPage />} />
            <Route path="aspirador/:entityId" element={<VacuumPage />} />
            <Route path="caixa-de-areia/:id" element={<LitterPage />} />
            <Route path="lava-e-seca/:id" element={<WasherPage />} />
            <Route path="cameras" element={<CamerasPage />} />
            <Route path="clima" element={<WeatherPage />} />
            <Route path="memoria" element={<MemoryPage />} />
            <Route path="automacoes" element={<AutomationsPage />} />
            <Route path="listas" element={<ListsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
