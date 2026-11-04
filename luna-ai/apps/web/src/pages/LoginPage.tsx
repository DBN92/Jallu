import { useState, type FormEvent } from 'react';
import { LunaOrb } from '../components/LunaOrb';
import { Banner, Button, inputClass } from '../components/ui';
import { errorMessage } from '../services/api';
import { useAuth } from '../stores/auth';

export default function LoginPage({ mode }: { mode: 'login' | 'setup' }) {
  const { login, setup } = useAuth();
  const [form, setForm] = useState({ username: '', password: '', displayName: '', setupCode: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'setup') await setup(form);
      else await login(form.username, form.password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-bg flex h-full justify-center overflow-y-auto px-5 py-10">
      <form onSubmit={submit} className="my-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LunaOrb state={busy ? 'processing' : 'idle'} size={120} />
          <h1 className="mt-6 text-3xl font-semibold">
            Luna <span className="text-gradient">AI</span>
          </h1>
          <p className="mt-1 text-sm text-white/50">{mode === 'setup' ? 'Vamos configurar sua assistente.' : 'Entre para continuar.'}</p>
        </div>
        {error && <Banner>{error}</Banner>}
        <div className="glass space-y-3 rounded-sm p-5">
          {mode === 'setup' && (
            <>
              <label className="block text-sm text-white/60">
                Como devo te chamar?
                <input className={`${inputClass} mt-1`} value={form.displayName} onChange={set('displayName')} required maxLength={60} autoComplete="name" />
              </label>
              <label className="block text-sm text-white/60">
                Código de configuração
                <input className={`${inputClass} mt-1`} value={form.setupCode} onChange={set('setupCode')} required autoComplete="off" />
                <span className="mt-1 block text-xs text-white/35">Valor de LUNA_SETUP_CODE no .env do servidor.</span>
              </label>
            </>
          )}
          <label className="block text-sm text-white/60">
            Usuário
            <input className={`${inputClass} mt-1`} value={form.username} onChange={set('username')} required minLength={3} autoComplete="username" autoCapitalize="none" />
          </label>
          <label className="block text-sm text-white/60">
            Senha
            <input className={`${inputClass} mt-1`} type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} />
          </label>
          <Button type="submit" busy={busy} className="w-full">
            {mode === 'setup' ? 'Criar administrador' : 'Entrar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
