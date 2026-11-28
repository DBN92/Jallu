import { useEffect, useState } from 'react';
import { nativeApp } from '../lib/native';
import { Button, inputClass } from './ui';

interface Info {
  ready: boolean;
  google: boolean;
  engine: string;
  current: string;
  rate: number;
  voices: { name: string; quality: number; network: boolean }[];
}

const SAMPLE = 'Olá! Eu sou a Luna. Acendi a luz da sala e amanhã tem chance de chuva à tarde.';

/** App do tablet: escolher a voz do Android (vozes em português do Brasil instaladas), ouvir e baixar mais. */
export function AndroidVoiceSettings() {
  const app = nativeApp();
  const [info, setInfo] = useState<Info | null>(null);
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState(1.05);

  useEffect(() => {
    if (!app?.androidVoices) return;
    let tries = 0;
    const load = () => {
      try {
        const i = JSON.parse(app.androidVoices!()) as Info;
        setInfo(i);
        setVoice(i.current);
        setRate(i.rate || 1.05);
        return i.ready;
      } catch {
        return false;
      }
    };
    if (load()) return;
    // A voz do Android leva um instante para ficar pronta na primeira vez
    const t = setInterval(() => (load() || ++tries > 10) && clearInterval(t), 800);
    const back = () => load();
    window.addEventListener('focus', back);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', back);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!app?.androidVoices) return <p className="text-xs text-white/45">Atualize o app do tablet (1.0.21 ou mais nova) para escolher a voz do Android aqui.</p>;
  if (!info?.ready) return <p className="text-xs text-white/45">Carregando as vozes do Android…</p>;

  const save = (v: string, r: number) => app.setAndroidVoice?.(v, r);
  const label = (v: Info['voices'][number], i: number) => `Voz ${i + 1}${v.network ? ' (precisa de internet)' : ''}${v.quality >= 400 ? ' · alta qualidade' : ''}`;

  return (
    <div className="space-y-3">
      {!info.google && (
        <div className="rounded-sm border border-amber-300/30 bg-amber-400/5 p-3 text-xs text-amber-100/90">
          A voz do Google (bem mais natural que a da Samsung) não está instalada.
          <div className="mt-2">
            <Button variant="ghost" onClick={() => app.installAndroidVoices?.()}>
              Instalar a voz do Google
            </Button>
          </div>
        </div>
      )}
      <label className="block text-sm">
        Voz do Android
        <select
          className={`${inputClass} mt-1`}
          value={voice}
          onChange={(e) => {
            setVoice(e.target.value);
            save(e.target.value, rate);
            setTimeout(() => app.testAndroidVoice?.(SAMPLE), 150);
          }}
        >
          <option value="">Automática — a melhor instalada</option>
          {info.voices.map((v, i) => (
            <option key={v.name} value={v.name}>
              {label(v, i)}
            </option>
          ))}
        </select>
      </label>
      {info.voices.length === 0 && <p className="text-xs text-amber-200/80">Nenhuma voz em português do Brasil instalada. Toque em “Baixar mais vozes”.</p>}
      <label className="block text-sm">
        Velocidade: {rate.toFixed(2)}x
        <input type="range" min={0.7} max={1.5} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} onPointerUp={() => save(voice, rate)} onTouchEnd={() => save(voice, rate)} className="mt-2 w-full" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => (save(voice, rate), app.testAndroidVoice?.(SAMPLE))}>
          Ouvir
        </Button>
        {info.google && (
          <Button variant="ghost" onClick={() => app.installAndroidVoices?.()}>
            Baixar mais vozes
          </Button>
        )}
      </div>
      <p className="text-xs text-white/45">
        {info.google ? 'Usando o mecanismo de voz do Google.' : 'Usando o mecanismo de voz padrão do tablet.'} Ao escolher uma voz ela já toca uma frase de exemplo.
      </p>
    </div>
  );
}
