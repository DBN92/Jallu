import { useCallback, useEffect, useRef, useState } from 'react';
import { toSpeech } from '../lib/speechText';

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

/**
 * Pontua a qualidade de uma voz do aparelho. Vozes “Premium/Aprimorada/Enhanced” (iPhone),
 * “Natural/Neural” e as vozes online do Google (Android/Chrome) soam muito mais humanas.
 */
export function rankVoice(v: SpeechSynthesisVoice): number {
  let score = 0;
  const lang = v.lang.toLowerCase().replace('_', '-');
  if (lang === 'pt-br') score += 10;
  else if (lang.startsWith('pt')) score += 4;
  else return -1;
  if (/premium/i.test(v.name)) score += 8;
  if (/aprimorad|enhanced|melhorad/i.test(v.name)) score += 6;
  if (/natural|neural|online/i.test(v.name)) score += 6;
  if (/google/i.test(v.name)) score += 4;
  if (!v.localService) score += 1;
  // Identidade feminina da DIA
  if (/luciana|francisca|fernanda|vit[oó]ria|maria|leila|thalita|camila|joana|raquel|let[ií]cia|female|feminin/i.test(v.name)) score += 3;
  if (/compact|eloquence|novelty|bad news|bells|boing|bubbles|cellos|jester|organ|superstar|whisper|zarvox|trinoids|wobble|albert|fred|junior|ralph|rocko|grandma|grandpa|shelley|sandy|flo|reed|eddy/i.test(v.name)) score -= 12;
  return score;
}

export function bestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return [...voices].sort((a, b) => rankVoice(b) - rankVoice(a)).find((v) => rankVoice(v) > 0);
}

export function isHighQuality(v: SpeechSynthesisVoice) {
  return rankVoice(v) >= 16;
}

interface SpeakOpts {
  voiceName?: string | null;
  rate?: number;
  onEnd?: () => void;
  onError?: (code: string) => void;
}

/**
 * Síntese de voz (respostas faladas) com fila de frases: durante o streaming, cada frase
 * pronta entra na fila e começa a ser falada enquanto a próxima ainda está sendo gerada.
 */
export function useSpeechSynthesis() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  const session = useRef<{ opts: SpeakOpts; onIdle?: () => void; closed: boolean } | null>(null);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => rankVoice(v) > 0).sort((a, b) => rankVoice(b) - rankVoice(a)));
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

  /** Fala UMA frase; sempre chama done uma única vez (trava de segurança). */
  const utter = useCallback(
    (text: string, opts: SpeakOpts, done: () => void) => {
      const clean = toSpeech(text);
      if (!clean) return done();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'pt-BR';
      u.rate = opts.rate ?? 1;
      u.pitch = 1.05;
      const all = speechSynthesis.getVoices();
      const voice = (opts.voiceName && all.find((v) => v.name === opts.voiceName)) || bestVoice(all);
      try {
        if (voice) u.voice = voice;
      } catch {
        /* navegador recusou a voz: usa a padrão do idioma */
      }
      let finished = false;
      let started = false;
      const timers: number[] = [];
      const finish = () => {
        if (finished) return;
        finished = true;
        timers.forEach(clearTimeout);
        done();
      };
      u.onstart = () => (started = true);
      u.onend = finish;
      u.onerror = (e) => {
        const code = (e as SpeechSynthesisErrorEvent).error;
        if (code !== 'interrupted' && code !== 'canceled') opts.onError?.(code);
        finish();
      };
      timers.push(
        window.setTimeout(() => {
          if (!started && !finished) {
            speechSynthesis.cancel();
            opts.onError?.('not-started');
            finish();
          }
        }, 3000),
      );
      timers.push(window.setTimeout(finish, 5000 + (clean.length * 90) / (opts.rate ?? 1)));
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    },
    [],
  );

  const pump = useCallback(() => {
    const sess = session.current;
    if (!sess || busy.current) return;
    const next = queue.current.shift();
    if (next === undefined) {
      if (sess.closed) {
        session.current = null;
        setSpeaking(false);
        sess.onIdle?.();
      }
      return;
    }
    busy.current = true;
    setSpeaking(true);
    utter(next, sess.opts, () => {
      busy.current = false;
      pump();
    });
  }, [utter]);

  /** Começa (ou continua) uma fala em partes. */
  const enqueue = useCallback(
    (text: string, opts: SpeakOpts = {}) => {
      if (!supported || !text.trim()) return;
      if (!session.current) session.current = { opts, closed: false };
      queue.current.push(text);
      pump();
    },
    [supported, pump],
  );

  /** Indica que não virão mais frases; onIdle é chamado quando terminar de falar. */
  const finishQueue = useCallback(
    (onIdle?: () => void) => {
      if (!session.current) return onIdle?.();
      session.current.closed = true;
      session.current.onIdle = onIdle;
      pump();
    },
    [pump],
  );

  const cancel = useCallback(() => {
    queue.current = [];
    busy.current = false;
    session.current = null;
    if (supported) speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  /** Fala um texto completo (compatível com o uso anterior). */
  const speak = useCallback(
    (text: string, opts: SpeakOpts = {}) => {
      if (!supported || !text) return opts.onEnd?.();
      cancel();
      session.current = { opts, closed: false };
      queue.current.push(text);
      session.current.closed = true;
      session.current.onIdle = opts.onEnd;
      pump();
    },
    [supported, cancel, pump],
  );

  return { supported, voices, speaking, speak, enqueue, finishQueue, cancel, unlock };
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
