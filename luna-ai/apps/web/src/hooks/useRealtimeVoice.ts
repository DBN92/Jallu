import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantState } from '@luna/shared';
import { api, errorMessage } from '../services/api';
import { isWakeCall } from '../lib/text';
import { acquireScreen, releaseScreen } from '../lib/wakeLock';
import { useLocation } from '../stores/location';
import { useSettings } from '../stores/settings';

interface Session {
  clientSecret: string;
  model: string;
}

/**
 * Voz avançada: OpenAI Realtime via WebRTC.
 * O backend emite um token efêmero e executa (com validação) as ferramentas pedidas pelo modelo.
 */
export function useRealtimeVoice(opts: {
  onState: (s: AssistantState) => void;
  onTranscript: (role: 'user' | 'assistant', text: string) => void;
  conversationId: string | null;
  onConversation: (id: string) => void;
  /** Modo "Ei, Luna": só responde quando chamada pelo nome (ou logo após responder). */
  wakeWord?: boolean;
  /** Encerra a sessão após este tempo sem conversa (economia em aparelhos sempre ligados). */
  autoStopMs?: number;
  /** O navegador bloqueou o som (falta um toque na tela). */
  onAudioBlocked?: () => void;
}) {
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const pendingOutputs = useRef(0);
  const followUntil = useRef(0);
  const idleTimer = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const wakeLockRef = useRef<boolean | null>(null);
  const wakeRef = useRef(Boolean(opts.wakeWord));
  wakeRef.current = Boolean(opts.wakeWord);
  const convRef = useRef(opts.conversationId);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  convRef.current = opts.conversationId;

  const saveTranscript = useCallback(async (role: 'user' | 'assistant', text: string) => {
    optsRef.current.onTranscript(role, text);
    try {
      const r = await api<{ conversationId: string }>('/api/voice/transcript', { body: { role, text, conversationId: convRef.current ?? undefined } });
      if (r.conversationId !== convRef.current) {
        convRef.current = r.conversationId;
        optsRef.current.onConversation(r.conversationId);
      }
    } catch {
      /* histórico é melhor esforço */
    }
  }, []);

  const send = (event: Record<string, unknown>) => {
    if (dcRef.current?.readyState === 'open') dcRef.current.send(JSON.stringify(event));
  };

  const stop = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    speakingRef.current = false;
    if (wakeLockRef.current) {
      releaseScreen();
      wakeLockRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => undefined);
    if (audioRef.current) audioRef.current.srcObject = null;
    pcRef.current = null;
    dcRef.current = null;
    micRef.current = null;
    setActive(false);
    setConnecting(false);
    setLevel(0);
    optsRef.current.onState('idle');
  }, []);

  /** Reinicia o contador de inatividade (somente com autoStopMs). */
  const bumpIdle = () => {
    const ms = optsRef.current.autoStopMs;
    if (!ms) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (speakingRef.current || pendingOutputs.current > 0) bumpIdle();
      else stop();
    }, ms);
  };

  const meter = (streams: MediaStream[]) => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const analysers = streams.map((s) => {
      const a = ctx.createAnalyser();
      a.fftSize = 256;
      ctx.createMediaStreamSource(s).connect(a);
      return a;
    });
    const buf = new Uint8Array(128);
    const tick = () => {
      let max = 0;
      for (const a of analysers) {
        a.getByteTimeDomainData(buf);
        for (const v of buf) max = Math.max(max, Math.abs(v - 128) / 128);
      }
      setLevel(Math.min(1, max * 2.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const handleEvent = async (ev: { type: string; [k: string]: unknown }) => {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        bumpIdle();
        optsRef.current.onState('listening');
        break;
      case 'input_audio_buffer.speech_stopped':
        if (!wakeRef.current) optsRef.current.onState('processing');
        break;
      case 'output_audio_buffer.started':
        speakingRef.current = true;
        optsRef.current.onState('speaking');
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        // Após a Luna falar, aceita continuação sem precisar dizer "Luna" de novo
        followUntil.current = Date.now() + 15_000;
        speakingRef.current = false;
        bumpIdle();
        optsRef.current.onState('listening');
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const text = typeof ev.transcript === 'string' ? ev.transcript.trim() : '';
        if (!wakeRef.current) {
          if (text) void saveTranscript('user', text);
          break;
        }
        const called = isWakeCall(text);
        if (text && (called || Date.now() < followUntil.current)) {
          optsRef.current.onState('processing');
          void saveTranscript('user', text);
          send({ type: 'response.create' });
        } else {
          // Fala não dirigida à Luna: descarta do contexto e não salva (privacidade)
          if (typeof ev.item_id === 'string') send({ type: 'conversation.item.delete', item_id: ev.item_id });
          optsRef.current.onState('listening');
        }
        break;
      }
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (typeof ev.transcript === 'string' && ev.transcript.trim()) void saveTranscript('assistant', ev.transcript.trim());
        break;
      case 'response.function_call_arguments.done': {
        optsRef.current.onState('acting');
        pendingOutputs.current++;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(ev.arguments ?? '{}'));
        } catch {
          /* argumentos inválidos */
        }
        let output: unknown;
        try {
          const needsLocation = ev.name === 'get_weather' && useSettings.getState().useGps;
          const location = needsLocation ? ((await useLocation.getState().request()) ?? undefined) : undefined;
          const r = await api<{ output: unknown }>('/api/voice/tools', { body: { name: ev.name, arguments: args, location } });
          output = r.output;
        } catch (err) {
          output = { ok: false, erro: errorMessage(err) };
        }
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(output) } });
        pendingOutputs.current--;
        if (pendingOutputs.current === 0) send({ type: 'response.create' });
        break;
      }
      case 'error':
        setError(String((ev.error as { message?: string })?.message ?? 'Erro na sessão de voz.'));
        break;
    }
  };

  const start = useCallback(async (initialText?: string) => {
    if (active || connecting) return;
    setError(null);
    setConnecting(true);
    optsRef.current.onState('processing');
    try {
      if (!('RTCPeerConnection' in window)) throw new Error('Este navegador não suporta WebRTC.');
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micRef.current = mic;
      const session = await api<Session>('/api/voice/realtime/session', { body: { wakeWord: wakeRef.current } });
      followUntil.current = Date.now() + 15_000; // logo ao abrir, já pode falar sem "Luna"
      wakeLockRef.current = true;
      void acquireScreen();

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = audioRef.current ?? new Audio();
      audio.autoplay = true;
      (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
      audioRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0]!;
        void audio.play().catch(() => optsRef.current.onAudioBlocked?.());
        meter([mic, e.streams[0]!]);
      };
      pc.addTrack(mic.getAudioTracks()[0]!, mic);
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (m) => {
        try {
          void handleEvent(JSON.parse(m.data as string));
        } catch {
          /* ignora */
        }
      };
      dc.onopen = () => {
        setActive(true);
        setConnecting(false);
        optsRef.current.onState('listening');
        bumpIdle();
        // Pedido falado junto com a palavra de ativação ("Luna, acenda a luz") segue direto
        if (initialText) {
          void saveTranscript('user', initialText);
          send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: initialText }] } });
          send({ type: 'response.create' });
          optsRef.current.onState('processing');
        }
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
          if (pc.connectionState === 'failed') setError('A conexão de voz caiu.');
          stop();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${session.clientSecret}`, 'Content-Type': 'application/sdp' },
      });
      if (!res.ok) throw new Error(`A OpenAI recusou a conexão de voz (${res.status}).`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    } catch (err) {
      const e = err as Error;
      setError(e.name === 'NotAllowedError' ? 'Permissão do microfone negada.' : errorMessage(err));
      stop();
      optsRef.current.onState('error');
      setTimeout(() => optsRef.current.onState('idle'), 3000);
    }
  }, [active, connecting, stop]);

  /** Interrompe a fala atual da Luna. */
  const interrupt = useCallback(() => {
    send({ type: 'response.cancel' });
    send({ type: 'output_audio_buffer.clear' });
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { active, connecting, error, level, start, stop, interrupt };
}
