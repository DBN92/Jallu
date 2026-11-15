import { useEffect, useState } from 'react';
import { nativeApp } from '../lib/native';
import { Button, Toggle } from './ui';

interface UpdateStatus {
  auto: boolean;
  canInstall: boolean;
  status: string;
  version: string;
}

/** App do tablet: atualizar sozinho quando houver versão nova no servidor da Luna. */
export function AppUpdateSettings() {
  const app = nativeApp();
  const read = () => {
    try {
      return JSON.parse(app?.updateStatus?.() ?? 'null') as UpdateStatus | null;
    } catch {
      return null;
    }
  };
  const [st, setSt] = useState<UpdateStatus | null>(read);
  useEffect(() => {
    const t = setInterval(() => setSt(read()), 2000);
    const back = () => setSt(read());
    window.addEventListener('focus', back);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', back);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!app?.updateStatus || !st) return null;
  return (
    <div className="border-t border-white/10 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p>Atualizar o app sozinho</p>
          <p className="mt-0.5 text-xs text-white/50">Confere a cada 3 horas se há versão nova no servidor e instala fora das conversas. Versão atual: {st.version}. {st.status && `Situação: ${st.status}.`}</p>
        </div>
        <Toggle label="Atualizar o app sozinho" checked={st.auto} onChange={(v) => (app.setAutoUpdate?.(v), setTimeout(() => setSt(read()), 300))} />
      </div>
      {st.auto && !st.canInstall && (
        <div className="mt-2 rounded-sm border border-amber-300/30 bg-amber-400/5 p-3 text-xs text-amber-100/90">
          Para instalar sem pedir confirmação, libere “Instalar apps desconhecidos” para a Luna (uma vez só).
          <div className="mt-2">
            <Button type="button" variant="ghost" onClick={() => app.allowInstall?.()}>
              Permitir
            </Button>
          </div>
        </div>
      )}
      {st.auto && (
        <div className="mt-2">
          <Button type="button" variant="ghost" onClick={() => (app.checkUpdate?.(), setTimeout(() => setSt(read()), 800))}>
            Verificar agora
          </Button>
        </div>
      )}
    </div>
  );
}
