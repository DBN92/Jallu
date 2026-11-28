import { useEffect, useState } from 'react';
import { Mic, Trash2 } from 'lucide-react';
import { nativeApp } from '../lib/native';

interface VoiceIdStatus {
  mode: 'off' | 'observe' | 'block';
  rigor: 'leve' | 'normal' | 'rigido';
  minSamples: number;
  ready: boolean;
  people: { name: string; count: number }[];
}
type EnrollEvent = { state: 'baixando' | 'gravando' | 'ok' | 'erro'; name: string; count: number; message: string };

/** Pessoas sugeridas (a casa pediu só estas duas por enquanto) */
const SUGGESTED = ['Daniel', 'Natália'];
const GOAL = 6;

/**
 * Ajustes › App Android › Vozes que chamam a Luna: cada pessoa grava algumas vezes “Oi, Luna”; o app
 * guarda só a assinatura (números) e passa a reconhecer quem chamou. Começa em “observar”.
 */
export function VoiceIdSettings() {
  const bridge = nativeApp();
  const read = (): VoiceIdStatus | null => {
    try {
      return bridge?.voiceIdStatus ? (JSON.parse(bridge.voiceIdStatus()) as VoiceIdStatus) : null;
    } catch {
      return null;
    }
  };
  const [st, setSt] = useState<VoiceIdStatus | null>(read);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<EnrollEvent>).detail;
      if (d.state === 'baixando') setMsg({ text: 'Baixando o modelo de assinatura de voz (13 MB, só desta vez)…' });
      else if (d.state === 'gravando') setMsg({ text: `${d.name}: fale “Oi, Luna” agora, no seu tom normal.` });
      else {
        setBusy(null);
        if (d.state === 'ok') {
          setMsg({ text: `Amostra ${d.count} de ${d.name} guardada.${d.count < GOAL ? ' Grave mais algumas, de lugares diferentes da sala.' : ''}` });
          const now = read();
          // Primeira pessoa com amostras suficientes: começa a observar (sem barrar ninguém ainda)
          if (now && now.mode === 'off' && d.count >= now.minSamples) bridge?.setVoiceMode?.('observe');
        } else setMsg({ text: d.message || 'Não consegui gravar. Tente de novo.', bad: true });
        setTimeout(() => setSt(read()), 150);
      }
    };
    window.addEventListener('dia-native-enroll', on);
    return () => window.removeEventListener('dia-native-enroll', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bridge?.voiceIdStatus) return <p className="py-3 text-xs text-white/50">Atualize o app do tablet para cadastrar as vozes.</p>;
  if (!st) return null;
  const names = [...new Set([...SUGGESTED, ...st.people.map((p) => p.name)])];
  const count = (n: string) => st.people.find((p) => p.name === n)?.count ?? 0;
  const anyReady = st.people.some((p) => p.count >= st.minSamples);
  const set = (fn: () => void) => {
    fn();
    setTimeout(() => setSt(read()), 200);
  };

  return (
    <div className="space-y-3 border-t border-white/10 py-3">
      <div>
        <p>Vozes que chamam a Luna</p>
        <p className="mt-0.5 text-xs text-white/50">
          Cada pessoa grava “Oi, Luna” umas {GOAL} vezes (sem TV ligada, de pontos diferentes da sala). O tablet guarda só a assinatura da voz — números, não a gravação — e ela não sai do aparelho.
        </p>
      </div>
      {names.map((n) => (
        <div key={n} className="flex items-center justify-between gap-3 rounded-sm bg-white/5 px-3 py-2">
          <div className="min-w-0">
            <p className="font-semibold text-white">{n}</p>
            <p className="text-xs text-white/50">
              {count(n)} de {GOAL} amostras{count(n) > 0 && count(n) < st.minSamples ? ` · mínimo ${st.minSamples} para valer` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              disabled={!!busy}
              onClick={() => {
                setBusy(n);
                setMsg({ text: `${n}: espere o bip e diga “Oi, Luna”.` });
                bridge.voiceEnroll?.(n);
              }}
              className="flex items-center gap-1.5 rounded-full bg-cyan-400/20 px-3 py-1.5 text-xs text-cyan-50 disabled:opacity-40"
            >
              <Mic className="h-3.5 w-3.5" /> {busy === n ? 'Gravando…' : 'Gravar'}
            </button>
            {count(n) > 0 && (
              <button
                disabled={!!busy}
                onClick={() => confirm(`Apagar as amostras de voz de ${n}?`) && set(() => bridge.voiceDelete?.(n))}
                className="rounded-full p-2 text-rose-300/80 disabled:opacity-40"
                aria-label={`Apagar a voz de ${n}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}
      {msg && <p className={`text-xs ${msg.bad ? 'text-rose-300' : 'text-cyan-100/80'}`}>{msg.text}</p>}

      <div>
        <p className="text-sm">Quando outra voz disser “Oi, Luna”</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-sm bg-white/5 p-1">
          {(
            [
              ['off', 'Atende todos'],
              ['observe', 'Só observar'],
              ['block', 'Ignorar'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              disabled={m !== 'off' && !anyReady}
              onClick={() => set(() => bridge.setVoiceMode?.(m))}
              className={`rounded-sm py-2 text-xs disabled:opacity-40 ${st.mode === m ? 'bg-cyan-400/25 text-cyan-50' : 'text-white/70'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-white/45">
          {st.mode === 'observe'
            ? 'Atende todo mundo, mas anota no diagnóstico quem ela reconheceu e quem teria ignorado. Use uns dias assim antes de passar para “Ignorar”.'
            : st.mode === 'block'
              ? 'Só Daniel e Natália (as vozes cadastradas) chamam a Luna por voz. O toque na tela continua valendo para todos.'
              : anyReady
                ? 'A Luna atende qualquer voz.'
                : `Cadastre pelo menos ${st.minSamples} amostras de alguém para ligar.`}
        </p>
      </div>

      {st.mode !== 'off' && (
        <div>
          <p className="text-sm">Rigor</p>
          <div className="mt-1.5 flex gap-1">
            {(
              [
                ['leve', 'Leve'],
                ['normal', 'Normal'],
                ['rigido', 'Rígido'],
              ] as const
            ).map(([r, label]) => (
              <button key={r} onClick={() => set(() => bridge.setVoiceRigor?.(r))} className={`rounded-full px-3 py-1.5 text-xs ${st.rigor === r ? 'bg-cyan-400/25 text-cyan-50' : 'bg-white/10 text-white/70'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-white/45">Leve: quase nunca recusa vocês (pode deixar passar outra voz). Rígido: barra mais, mas às vezes pode recusar vocês de longe.</p>
        </div>
      )}
    </div>
  );
}
