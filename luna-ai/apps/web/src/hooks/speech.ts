import { useCallback, useEffect, useRef, useState } from 'react';

/* Tipos mínimos da Web Speech API (não inclusos no lib DOM) */
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent { error: string }
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const SR_ERRORS: Record<string, string> = {
  'not-allowed': 'Permissão do microfone negada. Libere o microfone nos ajustes do navegador.',
  'service-not-allowed': 'O reconhecimento de fala do sistema não está disponível. No iPhone, ative a Siri/Ditado ou use a transcrição na nuvem.',
  'no-speech': 'Não ouvi nada. Tente novamente.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network: 'O reconhecimento de fala precisa de internet.',
  aborted: '',
};

/** Reconhecimento de fala do navegador (modo básico). */
export function useSpeechRecognition() {
  const Ctor = getRecognitionCtor();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const start = useCallback(
    (handlers: { onInterim?: (t: string) => void; onFinal: (t: string) => void }) => {
      if (!Ctor) {
        setError('Este navegador não suporta reconhecimento de fala.');
        return false;
      }
      recRef.current?.abort();
      const rec = new Ctor();
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      let finalText = '';
      rec.onstart = () => {
        setError(null);
        setListening(true);
      };
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        handlers.onInterim?.((finalText + interim).trim());
      };
      rec.onerror = (e) => {
        const msg = SR_ERRORS[e.error] ?? `Falha no reconhecimento de fala (${e.error}).`;
        if (msg) setError(msg);
      };
      rec.onend = () => {
        setListening(false);
        recRef.current = null;
        if (finalText.trim()) handlers.onFinal(finalText.trim());
      };
      recRef.current = rec;
      try {
        rec.start();
        return true;
      } catch {
        setError('Não consegui iniciar o microfone.');
        return false;
      }
    },
    [Ctor],
  );

  const stop = useCallback(() => recRef.current?.stop(), []);
  const abort = useCallback(() => recRef.current?.abort(), []);
  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: Boolean(Ctor), listening, error, setError, start, stop, abort };
}

/** Síntese de voz (respostas faladas) com escolha de voz e velocidade. */
export function useSpeechSynthesis() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('pt')));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  /** iOS só libera a fala após um gesto do usuário: chame no toque do botão. */
  const unlock = useCallback(() => {
    if (!supported) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }, [supported]);

  const speak = useCallback(
    (text: string, opts: { voiceName?: string | null; rate?: number; onEnd?: () => void; onError?: (code: string) => void } = {}) => {
      if (!supported || !text) {
        opts.onEnd?.();
        return;
      }
      const clean = text.replace(/[*_#`>✓✗]/g, '').replace(/\n+/g, '. ');
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'pt-BR';
      u.rate = opts.rate ?? 1;
      const all = speechSynthesis.getVoices();
      const voice = (opts.voiceName && all.find((v) => v.name === opts.voiceName)) || all.find((v) => v.lang === 'pt-BR') || all.find((v) => v.lang.startsWith('pt'));
      if (voice) u.voice = voice;

      // Garante que onEnd seja chamado UMA vez, mesmo se o navegador nunca disparar eventos
      let done = false;
      let started = false;
      const timers: number[] = [];
      const finish = () => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        setSpeaking(false);
        opts.onEnd?.();
      };
      u.onstart = () => {
        started = true;
        setSpeaking(true);
      };
      u.onend = finish;
      u.onerror = (e) => {
        const code = (e as SpeechSynthesisErrorEvent).error;
        if (code !== 'interrupted' && code !== 'canceled') opts.onError?.(code);
        finish();
      };
      // Bloqueada (ex.: Android sem toque na tela): nunca começa
      timers.push(
        window.setTimeout(() => {
          if (!started && !done) {
            speechSynthesis.cancel();
            opts.onError?.('not-started');
            finish();
          }
        }, 3000),
      );
      // Limite máximo pela duração estimada da frase
      timers.push(window.setTimeout(finish, 5000 + (clean.length * 90) / (opts.rate ?? 1)));

      speechSynthesis.cancel();
      // O Chrome no Android às vezes ignora speak() logo após cancel(): pequeno atraso
      window.setTimeout(() => {
        if (done) return;
        speechSynthesis.resume();
        speechSynthesis.speak(u);
      }, 60);
    },
    [supported],
  );

  const cancel = useCallback(() => {
    if (supported) speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, voices, speaking, speak, cancel, unlock };
}

/** Gravação de áudio para transcrição no servidor (alternativa ao reconhecimento do navegador). */
export function useRecorder() {
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.start();
    recRef.current = rec;
    setRecording(true);
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recRef.current;
        if (!rec) return resolve(null);
        rec.onstop = () => {
          rec.stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          recRef.current = null;
          resolve(chunks.current.length ? new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }) : null);
        };
        rec.stop();
      }),
    [],
  );

  return { supported, recording, start, stop };
}
