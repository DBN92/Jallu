import { useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Bot, Brain, Cctv, CloudSun, Home, ListChecks, MessagesSquare, Settings, Workflow } from 'lucide-react';
import { useAssistant } from '../stores/assistant';
import { useKioskMode } from '../hooks/useKioskMode';
import { AnimatedBackground } from './AnimatedBackground';
import { Bezel, Scene } from './Scene';
import { CameraViewer } from './CameraViewer';
import { useDevices } from '../stores/devices';

export const NAV = [
  { to: '/', label: 'Início', icon: Bot, end: true },
  { to: '/conversas', label: 'Conversas', icon: MessagesSquare },
  { to: '/casa', label: 'Casa', icon: Home },
  { to: '/listas', label: 'Listas', icon: ListChecks },
  { to: '/cameras', label: 'Câmeras', icon: Cctv },
  { to: '/clima', label: 'Clima', icon: CloudSun },
  { to: '/memoria', label: 'Memória', icon: Brain },
  { to: '/automacoes', label: 'Automações', icon: Workflow },
  { to: '/configuracoes', label: 'Ajustes', icon: Settings },
];

function ConnectionBar() {
  const server = useAssistant((s) => s.serverConnected);
  const ha = useDevices((s) => s.haConnected);
  if (server && ha !== false) return null;
  return (
    <div className="font-hud fixed inset-x-0 top-0 z-50 border-b border-rose-400/50 bg-rose-950/90 pt-safe pb-1 text-center text-xs font-semibold tracking-[0.2em] text-rose-200 uppercase">
      ⚠ {!server ? 'Link em tempo real perdido — reconectando' : 'Home Assistant offline — estados podem estar desatualizados'}
    </div>
  );
}

export function Layout() {
  useKioskMode();
  return (
    <div className="app-bg layout-root relative flex h-full flex-col">
      <Scene />
      <AnimatedBackground />
      <Bezel />
      <ConnectionBar />
      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
      <Dock />
      <CameraViewer />
    </div>
  );
}

/** Barra de navegação em “dock” com botões redondos iluminados. */
function Dock() {
  const ref = useRef<HTMLElement>(null);
  // Altura do menu numa variável CSS: no tema Vidro o conteúdo rola por trás dele
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const set = () => document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <nav ref={ref} className="dock-nav relative z-40 shrink-0 px-1 pt-2 pb-safe md:pb-3">
      <div className="dock-bg" aria-hidden="true" />
      <div className="dock-row relative mx-auto flex max-w-[760px] items-start justify-around gap-1 px-2 md:justify-center md:gap-5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `dock-btn font-hud flex min-w-0 flex-col items-center gap-1 text-[8px] font-semibold tracking-[0.1em] min-[400px]:text-[9px] uppercase md:text-[10px] ${isActive ? 'active text-cyan-100' : 'text-cyan-100/50'}`}>
            <i className="h-9 w-9 min-[400px]:h-10 min-[400px]:w-10 md:h-12 md:w-12 [@media(max-height:560px)]:h-9 [@media(max-height:560px)]:w-9">
              <Icon className="h-[18px] w-[18px] text-cyan-300 md:h-5 md:w-5" />
            </i>
            <span className="max-w-full truncate px-0.5 [@media(max-height:560px)]:hidden">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Contêiner rolável padrão para as páginas secundárias. */
export function Page({ children }: { children: React.ReactNode }) {
  return <div className="dock-pad mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 pt-safe pb-6 md:px-8 md:pb-6 md:pt-8">{children}</div>;
}
