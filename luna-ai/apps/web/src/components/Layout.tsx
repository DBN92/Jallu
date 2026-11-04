import { NavLink, Outlet } from 'react-router-dom';
import { Bot, Brain, CloudSun, Home, MessagesSquare, Settings, Workflow } from 'lucide-react';
import { useAssistant } from '../stores/assistant';
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
    <div className="fixed inset-x-0 top-0 z-50 bg-rose-600/90 pt-safe pb-1 text-center text-xs font-medium text-white backdrop-blur">
      {!server ? 'Sem conexão em tempo real com a Luna — tentando reconectar…' : 'Home Assistant desconectado — os dispositivos podem estar desatualizados.'}
    </div>
  );
}

export function Layout() {
  return (
    <div className="app-bg flex h-full">
      <ConnectionBar />
      {/* Barra lateral (telas grandes) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/5 p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2 pt-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold">
            Luna <span className="text-gradient">AI</span>
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`
              }
            >
              <Icon className="h-5 w-5" />
              {label === 'Ajustes' ? 'Configurações' : label === 'Casa' ? 'Minha casa' : label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-white/10 bg-ink-950/90 pb-safe backdrop-blur-xl md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] transition ${isActive ? 'text-cyan-300' : 'text-white/45'}`}
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate px-0.5">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Contêiner rolável padrão para as páginas secundárias. */
export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pt-safe pb-28 md:pb-10 md:pt-8">{children}</div>;
}
