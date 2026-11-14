import { useEffect, useState } from 'react';
import { cameraAvailable } from '../lib/deviceCamera';
import { nativeApp } from '../lib/native';
import { usePresenceStore } from '../hooks/usePresence';
import { useSettings } from '../stores/settings';
import { Button, Toggle } from './ui';

const chip = (on: boolean) => `rounded-sm py-2 text-sm ${on ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50' : 'text-white/70'}`;

/** Ajustes › Câmera deste aparelho: acordar quando alguém chega perto e escurecer sem ninguém. */
export function PresenceSettings() {
  const { presenceWake, setPresenceWake, dimAfter, setDimAfter } = useSettings();
  const { status, level, light } = usePresenceStore();
  const ok = cameraAvailable();
  const app = nativeApp();
  const canOff = !!app?.sleepScreen;
  // A permissão de apagar a tela é liberada numa tela do Android: confere de novo ao voltar
  const [offReady, setOffReady] = useState(() => !!app?.screenOffReady?.());
  useEffect(() => {
    if (!canOff) return;
    const check = () => setOffReady(!!nativeApp()?.screenOffReady?.());
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [canOff]);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">Acordar quando alguém chegar perto</p>
          <p className="mt-0.5 text-xs text-white/45">A câmera da frente percebe quem se aproxima e sai do descanso de tela. Nada é gravado nem enviado: só compara imagens minúsculas no próprio aparelho.</p>
        </div>
        <Toggle label="Acordar quando alguém chegar perto" checked={presenceWake} onChange={setPresenceWake} />
      </div>
      <p className="mt-4 mb-2 text-sm">{canOff && offReady ? 'Apagar a tela sem ninguém por perto' : 'Escurecer a tela sem ninguém por perto'}</p>
      <div className="grid grid-cols-5 gap-1 rounded-sm bg-white/5 p-1">
        {[0, 2, 5, 10, 30].map((m) => (
          <button key={m} onClick={() => setDimAfter(m)} className={chip(dimAfter === m)}>
            {m === 0 ? 'Nunca' : `${m} min`}
          </button>
        ))}
      </div>
      {canOff && offReady && app?.disableScreenOff && (
        <p className="mt-2 text-xs text-white/45">
          A Luna tem permissão para apagar a tela.{' '}
          <button
            className="underline"
            onClick={() => {
              app.disableScreenOff?.();
              setTimeout(() => setOffReady(!!nativeApp()?.screenOffReady?.()), 600);
            }}
          >
            Tirar a permissão
          </button>{' '}
          (necessário antes de desinstalar o app).
        </p>
      )}
      {canOff && !offReady && (
        <div className="mt-3 rounded-sm border border-amber-300/30 bg-amber-400/5 p-3">
          <p className="text-xs text-amber-100/90">Para a tela apagar de verdade (e acender sozinha quando alguém chegar), o Android pede que a Luna seja “administrador do aparelho”. Ela usa isso só para apagar a tela. Sem isso, a tela fica preta com o brilho no mínimo.</p>
          <div className="mt-2">
            <Button variant="ghost" onClick={() => app?.enableScreenOff?.()}>
              Permitir apagar a tela
            </Button>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-white/45">
        {!ok
          ? 'Neste aparelho a câmera só funciona pelo app Android da Luna (1.0.8 ou mais nova) ou por um endereço https.'
          : presenceWake || dimAfter > 0
            ? `Câmera: ${status}${status.startsWith('olhando') ? (light < 6 ? ' · escuro demais: a câmera não enxerga, acende com toque' : level > 0.015 ? ' · movimento agora' : ' · parado') : ''}. Toque na tela ou passe na frente para acender.`
            : 'Desligado: a câmera fica fechada.'}
      </p>
    </div>
  );
}
