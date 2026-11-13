import { cameraAvailable } from '../lib/deviceCamera';
import { usePresenceStore } from '../hooks/usePresence';
import { useSettings } from '../stores/settings';
import { Toggle } from './ui';

const chip = (on: boolean) => `rounded-sm py-2 text-sm ${on ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50' : 'text-white/70'}`;

/** Ajustes › Câmera deste aparelho: acordar quando alguém chega perto e escurecer sem ninguém. */
export function PresenceSettings() {
  const { presenceWake, setPresenceWake, dimAfter, setDimAfter } = useSettings();
  const { status, level } = usePresenceStore();
  const ok = cameraAvailable();
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">Acordar quando alguém chegar perto</p>
          <p className="mt-0.5 text-xs text-white/45">A câmera da frente percebe quem se aproxima e sai do descanso de tela. Nada é gravado nem enviado: só compara imagens minúsculas no próprio aparelho.</p>
        </div>
        <Toggle label="Acordar quando alguém chegar perto" checked={presenceWake} onChange={setPresenceWake} />
      </div>
      <p className="mt-4 mb-2 text-sm">Escurecer a tela sem ninguém por perto</p>
      <div className="grid grid-cols-5 gap-1 rounded-sm bg-white/5 p-1">
        {[0, 2, 5, 10, 30].map((m) => (
          <button key={m} onClick={() => setDimAfter(m)} className={chip(dimAfter === m)}>
            {m === 0 ? 'Nunca' : `${m} min`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/45">
        {!ok
          ? 'Neste aparelho a câmera só funciona pelo app Android da Luna (1.0.8 ou mais nova) ou por um endereço https.'
          : presenceWake || dimAfter > 0
            ? `Câmera: ${status}${status === 'olhando' ? (level > 0.015 ? ' · movimento agora' : ' · parado') : ''}. Toque na tela ou passe na frente para acender.`
            : 'Desligado: a câmera fica fechada.'}
      </p>
    </div>
  );
}
