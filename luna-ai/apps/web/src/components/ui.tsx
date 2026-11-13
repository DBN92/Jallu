import type { ReactNode } from 'react';
import { AlertTriangle, Info, Loader2, X } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`hud-panel p-4 ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="hud-label page-kicker">Luna // sistema</p>
          <h1 className="hud-title hud-glow mt-1 text-xl font-bold text-cyan-50 uppercase md:text-2xl">{title}</h1>
          {subtitle && <p className="font-hud mt-0.5 text-sm tracking-wide text-cyan-100/55">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="hud-divider mt-3" />
    </header>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-sm border transition-colors disabled:opacity-40 ${checked ? 'border-cyan-300/70 bg-cyan-400/25 shadow-[0_0_12px_rgba(0,229,255,0.35)]' : 'border-white/15 bg-white/5'}`}
    >
      <span className={`absolute top-[3px] left-[3px] h-5 w-5 rounded-[2px] transition-transform ${checked ? 'translate-x-5 bg-cyan-300 shadow-[0_0_10px_#00e5ff]' : 'bg-white/40'}`} />
    </button>
  );
}

export function Banner({ kind = 'error', children, onClose }: { kind?: 'error' | 'info' | 'warn'; children: ReactNode; onClose?: () => void }) {
  const styles = {
    error: 'border-rose-400/40 bg-rose-500/10 text-rose-200',
    warn: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
    info: 'border-cyan-300/30 bg-cyan-400/10 text-cyan-50',
  }[kind];
  const Icon = kind === 'info' ? Info : AlertTriangle;
  return (
    <div className={`mb-3 flex items-start gap-2 rounded-sm border px-3 py-2 text-sm ${styles}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button onClick={onClose} aria-label="Fechar" className="opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = '',
  busy,
  label,
}: {
  children: ReactNode;
  /** Nome para leitores de tela quando o botão só tem ícone */
  label?: string;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  busy?: boolean;
}) {
  const styles = {
    primary: 'border border-cyan-300/60 bg-cyan-400/15 text-cyan-50 shadow-[0_0_16px_rgba(0,229,255,0.25)] hover:bg-cyan-400/25',
    ghost: 'border border-cyan-300/20 bg-cyan-950/30 text-cyan-50/90 hover:border-cyan-300/40 hover:bg-cyan-400/10',
    danger: 'border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      disabled={disabled || busy}
      className={`font-hud inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold tracking-wider uppercase transition active:scale-[0.98] disabled:opacity-50 ${styles} ${className}`}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export const inputClass =
  'w-full rounded-sm border border-cyan-300/20 bg-ink-900/80 px-3 py-2.5 text-base text-cyan-50 placeholder-cyan-100/30 outline-none focus:border-cyan-300/70 focus:shadow-[0_0_14px_rgba(0,229,255,0.2)]';
