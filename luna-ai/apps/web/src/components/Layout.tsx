import { NavLink, Outlet } from 'react-router-dom';
import { Bot, Brain, CloudSun, Home, MessagesSquare, Settings, Workflow } from 'lucide-react';
import { useAssistant } from '../stores/assistant';
import { useKioskMode } from '../hooks/useKioskMode';
import { AnimatedBackground } from './AnimatedBackground';
import { useDevices } from '../stores/devices';

export const NAV = [
  { to: '/', label: 'Início', icon: Bot, end: true },
  { to: '/conversas', label: 'Conversas', icon: MessagesSquare },
  { to: '/casa', label: 'Casa', icon: Home },
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
    <div className="app-bg relative flex h-full flex-col md:flex-row">
      <AnimatedBackground />
      <ConnectionBar />
      {/* Barra lateral (tablet/computador) */}
      <aside className="relative z-10 hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-cyan-300/10 bg-ink-950/90 p-4 md:flex [@media(max-height:560px)]:w-16 [@media(max-height:560px)]:p-2">
        <div className="mb-8 px-2 pt-2 [@media(max-height:560px)]:mb-3 [@media(max-height:560px)]:px-0 [@media(max-height:560px)]:text-center">
          <p className="hud-title hud-glow text-lg font-bold text-cyan-50 [@media(max-height:560px)]:text-[11px]">LUNA</p>
          <p className="hud-label mt-0.5 text-[9px] [@media(max-height:560px)]:hidden">assistente // v0.1</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }, i) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                `font-hud group flex items-center gap-3 border-l-2 px-3 py-2.5 [@media(max-height:560px)]:justify-center [@media(max-height:560px)]:py-2 text-sm font-semibold tracking-[0.12em] uppercase transition ${
                  isActive ? 'border-cyan-300 bg-cyan-400/10 text-cyan-100 shadow-[inset_8px_0_16px_-8px_rgba(0,229,255,0.4)]' : 'border-transparent text-cyan-100/45 hover:border-cyan-300/40 hover:text-cyan-100'
                }`
              }
            >
              <span className="text-[10px] text-cyan-300/50 tabular-nums [@media(max-height:560px)]:hidden">{String(i + 1).padStart(2, '0')}</span>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="[@media(max-height:560px)]:hidden">{label === 'Ajustes' ? 'Configurações' : label === 'Casa' ? 'Minha casa' : label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 [@media(max-height:560px)]:hidden">
          <div className="hud-divider mb-3" />
          <p className="hud-label text-[9px] text-cyan-300/40">sistema operacional</p>
          <p className="font-hud text-xs text-cyan-100/50">ZimaOS · Home Assistant</p>
        </div>
      </aside>

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="relative z-40 grid shrink-0 grid-cols-7 border-t border-cyan-300/20 bg-ink-950 pb-safe shadow-[0_-8px_24px_rgba(0,229,255,0.06)] md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `font-hud relative flex flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase transition ${
                isActive ? 'text-cyan-300 [text-shadow:0_0_8px_rgba(0,229,255,0.7)]' : 'text-cyan-100/40'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 h-0.5 w-8 bg-cyan-300 shadow-[0_0_8px_#00e5ff]" />}
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate px-0.5">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Contêiner rolável padrão para as páginas secundárias. */
export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 pt-safe pb-6 md:px-8 md:pb-10 md:pt-8">{children}</div>;
}
