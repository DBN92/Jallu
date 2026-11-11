import { useEffect, useRef, useState } from 'react';
import { matchWake } from '../lib/text';
import { create } from 'zustand';
import { acquireScreen, releaseScreen } from '../lib/wakeLock';
import { getRecognitionCtor, isIOS, type SpeechRecognitionLike } from './speech';

/**
 * Estrutura para a palavra de ativação “Oi, Luna”.
 * Funciona SOMENTE com o app aberto, em primeiro plano, e em navegadores com reconhecimento
 * contínuo (ex.: Chrome no computador/Android). No iPhone não há escuta contínua em PWA,
 * então o recurso é reportado como não suportado — não simulamos escuta em segundo plano.
 */
export function wakeWordSupport(mode: 'basic' | 'realtime' = 'basic'): { supported: boolean; reason: string | null } {
  // Na voz em tempo real o microfone já fica aberto durante a sessão: funciona em qualquer aparelho
  if (mode === 'realtime') return { supported: true, reason: null };
  if (!getRecognitionCtor()) return { supported: false, reason: 'Este navegador não oferece reconhecimento de fala.' };
  if (isIOS()) return { supported: false, reason: 'No modo básico o iPhone não permite escuta contínua. Use a voz em tempo real.' };
  return { supported: true, reason: null };
}

/** Últimas frases que o chamado “Oi, Luna” ouviu (para conferir em Configurações › Voz). */
export const useWakeLog = create<{ heard: { text: string; woke: boolean; at: number }[]; push: (text: string, woke: boolean) => void }>((set) => ({
  heard: [],
  push: (text, woke) => set((s) => ({ heard: [{ text, woke, at: Date.now() }, ...s.heard].slice(0, 8) })),
}));

export function useWakeWord(enabled: boolean, paused: boolean, onCommand: (text: string) => void) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    let retry: number | undefined;
    let lastActivity = Date.now();
    let failures = 0;
    let suspendedUntil = 0;
    void acquireScreen();

    const schedule = (ms: number) => {
      window.clearTimeout(retry);
      retry = window.setTimeout(run, ms);
    };

    // Um único reconhecedor por vez; reinicia sozinho quando o Chrome encerra a sessão
    function run() {
      if (stopped || document.visibilityState !== 'visible' || recRef.current) return;
      if (Date.now() < suspendedUntil) return schedule(suspendedUntil - Date.now() + 50);
      const rec = new Ctor!();
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = false;
      // Vários palpites por frase: falando baixo, o certo muitas vezes não é o primeiro
      rec.maxAlternatives = 5;
      rec.onstart = () => {
        lastActivity = Date.now();
        failures = 0;
        setError(null);
      };
      rec.onresult = (e) => {
        lastActivity = Date.now();
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          if (!r.isFinal) continue;
          const alts: string[] = [];
          for (let k = 0; k < (r.length || 1); k++) if (r[k]?.transcript) alts.push(r[k]!.transcript);
          const rest = matchWake(alts);
          useWakeLog.getState().push(alts[0] ?? '', rest !== null);
          if (rest !== null) {
            // Libera o microfone ANTES de ouvir o pedido/falar. A pausa curta evita
            // reabrir o microfone; se o pedido não ocupar a Luna, a escuta volta sozinha.
            suspendedUntil = Date.now() + 6000;
            rec.abort();
            cb.current(rest);
            return;
          }
        }
      };
      rec.onerror = (e) => {
        lastActivity = Date.now();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          failures = 99;
          setError('Sem permissão de microfone para o chamado “Oi, Luna”. Toque na tela e permita o microfone.');
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          failures++;
        }
      };
      rec.onend = () => {
        if (recRef.current === rec) recRef.current = null;
        if (stopped) return;
        // Recuo progressivo em falhas repetidas; normal: reinicia rápido
        schedule(failures >= 99 ? 15_000 : Math.min(10_000, 300 + failures * 1500));
      };
      recRef.current = rec;
      try {
        rec.start();
      } catch {
        recRef.current = null;
        failures++;
        schedule(1500);
      }
    }

    // Vigia: se o reconhecedor “morrer” sem avisar, recria
    const watchdog = window.setInterval(() => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (!recRef.current) run();
      else if (Date.now() - lastActivity > 75_000) {
        lastActivity = Date.now();
        recRef.current.abort();
      }
    }, 10_000);

    const onVis = () => {
      if (document.visibilityState === 'visible') schedule(300);
      else recRef.current?.abort();
    };
    document.addEventListener('visibilitychange', onVis);
    setArmed(true);
    schedule(250);
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      window.clearInterval(watchdog);
      releaseScreen();
      document.removeEventListener('visibilitychange', onVis);
      const rec = recRef.current;
      recRef.current = null;
      rec?.abort();
      setArmed(false);
    };
  }, [enabled, paused]);

  return { armed, error };
}
