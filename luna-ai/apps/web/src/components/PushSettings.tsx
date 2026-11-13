import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { currentEndpoint, disablePush, enablePush, pushSupport } from '../lib/push';
import { api, errorMessage } from '../services/api';
import { Button, Toggle } from './ui';

/** Ajustes › Avisos no celular: notificação quando um recado novo é gravado. */
export function PushSettings() {
  const support = pushSupport();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    void currentEndpoint().then((e) => setOn(!!e));
  }, []);

  const toggle = async (v: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      if (v) await enablePush();
      else await disablePush();
      setOn(v);
      setMsg({ text: v ? 'Pronto: este aparelho vai receber os avisos.' : 'Avisos desligados neste aparelho.', ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm">
            <BellRing className="h-4 w-4 text-cyan-300" /> Avisos neste celular
          </p>
          <p className="mt-0.5 text-xs text-white/45">Notificação quando alguém deixar um recado em vídeo. Tocar no aviso abre o recado. Vale só para este aparelho.</p>
        </div>
        {support.ok && <Toggle label="Avisos neste celular" checked={!!on} onChange={(v) => void toggle(v)} />}
      </div>
      {!support.ok && <p className="mt-2 text-xs text-amber-200/80">{support.why}</p>}
      {support.ok && on && (
        <div className="mt-2">
          <Button
            variant="ghost"
            busy={busy}
            onClick={async () => {
              try {
                const r = await api<{ sent: number; errors?: string[] }>('/api/push/test', { method: 'POST' });
                setMsg(
                  r.sent
                    ? { text: `Aviso de teste enviado${r.sent > 1 ? ` para ${r.sent} aparelhos` : ''}. Deve chegar em alguns segundos.`, ok: true }
                    : { text: r.errors?.length ? `O serviço de avisos recusou: ${r.errors.join(' · ')}` : 'Nenhum aparelho inscrito. Desligue e ligue os avisos de novo.', ok: false },
                );
              } catch (err) {
                setMsg({ text: errorMessage(err), ok: false });
              }
            }}
          >
            Enviar aviso de teste
          </Button>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-200' : 'text-rose-200'}`}>{msg.text}</p>}
    </div>
  );
}
