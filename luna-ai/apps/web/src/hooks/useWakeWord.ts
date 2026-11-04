import { useEffect, useRef, useState } from 'react';
import { normalize } from '../lib/text';
import { getRecognitionCtor, isIOS, type SpeechRecognitionLike } from './speech';

/**
 * Estrutura para a palavra de ativação “Ei, Luna”.
 * Funciona SOMENTE com o app aberto, em primeiro plano, e em navegadores com reconhecimento
 * contínuo (ex.: Chrome no computador/Android). No iPhone não há escuta contínua em PWA,
 * então o recurso é reportado como não suportado — não simulamos escuta em segundo plano.
 */
export function wakeWordSupport(): { supported: boolean; reason: string | null } {
  if (!getRecognitionCtor()) return { supported: false, reason: 'Este navegador não oferece reconhecimento de fala.' };
  if (isIOS()) return { supported: false, reason: 'O iPhone não permite escuta contínua em apps web. Toque no microfone para falar.' };
  return { supported: true, reason: null };
}

export function useWakeWord(enabled: boolean, paused: boolean, onCommand: (text: string) => void) {
  const [armed, setArmed] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const cb = useRef(onCommand);
  cb.current = onCommand;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!enabled || paused || !Ctor || !wakeWordSupport().supported) {
      setArmed(false);
      return;
    }
    let stopped = false;
    const run = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const rec = new Ctor();
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          if (!r.isFinal) continue;
          const text = normalize(r[0].transcript);
          const m = text.match(/\b(?:ei|oi|hey)?\s*luna\b\s*(.*)$/);
          if (m) cb.current(m[1]?.trim() ?? '');
        }
      };
      rec.onend = () => {
        if (!stopped) setTimeout(run, 400);
      };
      rec.onerror = () => undefined;
      recRef.current = rec;
      try {
        rec.start();
        setArmed(true);
      } catch {
        setArmed(false);
      }
    };
    const onVis = () => (document.visibilityState === 'visible' ? run() : recRef.current?.abort());
    document.addEventListener('visibilitychange', onVis);
    run();
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVis);
      recRef.current?.abort();
      setArmed(false);
    };
  }, [enabled, paused]);

  return { armed };
}
