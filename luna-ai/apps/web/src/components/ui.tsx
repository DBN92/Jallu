import type { ReactNode } from 'react';
import { AlertTriangle, Info, Loader2, X } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl p-4 ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-white/50">{subtitle}</p>}
      </div>
      {action}
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
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-gradient-to-r from-violet-500 to-cyan-400' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function Banner({ kind = 'error', children, onClose }: { kind?: 'error' | 'info' | 'warn'; children: ReactNode; onClose?: () => void }) {
  const styles = {
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
  }[kind];
  const Icon = kind === 'info' ? Info : AlertTriangle;
  return (
    <div className={`mb-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${styles}`} role={kind === 'error' ? 'alert' : 'status'}>
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
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  busy?: boolean;
}) {
  const styles = {
    primary: 'bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500 text-white shadow-lg shadow-violet-500/20',
    ghost: 'bg-white/8 text-white/90 hover:bg-white/12 border border-white/10',
    danger: 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 border border-rose-500/30',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 ${styles} ${className}`}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base text-white placeholder-white/35 outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20';
