import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AudioLines, Mic, MicOff, Plus, SendHorizontal, Square, Volume2, VolumeX } from 'lucide-react';
import { LunaOrb } from '../components/LunaOrb';
import { MessageList } from '../components/Messages';
import { ClockPanel, DevicesPanel, SensorsPanel, SystemPanel, WeatherPanel } from '../components/Dashboard';
import { AmbientMode } from '../components/AmbientMode';
import { VoiceFocus } from '../components/VoiceFocus';
import { Banner } from '../components/ui';
import { useSpeechRecognition, useSpeechSynthesis, useRecorder } from '../hooks/speech';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { useWakeWord, wakeWordSupport } from '../hooks/useWakeWord';
import { useClock, useWeather } from '../hooks/useWeather';
import { api, errorMessage } from '../services/api';
import { useAssistant } from '../stores/assistant';
import { useAuth } from '../stores/auth';
import { useSettings } from '../stores/settings';
import { greeting, playChime, STATE_LABEL } from '../lib/text';

function useViewportHeight() {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return h;
}

const STATE_DOT: Record<string, string> = {
  idle: 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
  listening: 'bg-cyan-300 animate-pulse shadow-[0_0_8px_#00e5ff]',
  processing: 'bg-violet-400 animate-pulse shadow-[0_0_8px_#9a8cff]',
  acting: 'bg-amber-400 animate-pulse shadow-[0_0_8px_#ffb547]',
  speaking: 'bg-sky-400 animate-pulse shadow-[0_0_8px_#38bdf8]',
  error: 'bg-rose-500 shadow-[0_0_8px_#f43f5e]',
};

export default function HomePage() {
  const user = useAuth((s) => s.user);
  const { state, messages, interim, send, setState, setInterim, newConversation, appendLocal, conversationId, setConversationId } = useAssistant();
  const settings = useSettings((s) => s.settings);
  const voiceMode = useSettings((s) => s.voiceMode);
  const now = useClock();
  const weather = useWeather('auto');
  const sr = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const recorder = useRecorder();
  const [text, setText] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Android/computador: o Chrome escuta "Luna" de graça; a sessão da OpenAI só abre quando chamada.
  // iPhone: sem escuta contínua no navegador, o filtro de "Luna" roda dentro da sessão em tempo real.
  const wakeEnabled = Boolean(settings?.wakeWordEnabled);
  const localWake = wakeWordSupport('basic').supported;

  const realtime = useRealtimeVoice({
    onState: setState,
    onTranscript: (role, t) => appendLocal({ role, content: t, channel: 'voice', provider: role === 'assistant' ? 'openai-realtime' : null }),
    conversationId,
    onConversation: setConversationId,
    wakeWord: wakeEnabled && voiceMode === 'realtime' && !localWake,
    autoStopMs: wakeEnabled && localWake ? 30_000 : undefined,
    onAudioBlocked: () => setNeedsTap(true),
  });

  // Conversa por voz em tela cheia: ativa ao começar a falar e some após ~2,5 s sem conversa
  const [voiceFocus, setVoiceFocus] = useState(false);

  // Android/Chrome só libera áudio depois de um toque na tela (política de autoplay)
  const [needsTap, setNeedsTap] = useState(false);
  const [, setTick] = useState(0);
  const followUpRef = useRef(false);
  const startListeningRef = useRef<(followUp?: boolean) => void>(() => undefined);

  const speakReply = useCallback(
    (reply: string, continueAfter = false) => {
      if (muted || !settings?.autoSpeak || !tts.supported) {
        setState('idle');
        return;
      }
      setState('speaking');
      tts.speak(reply, {
        voiceName: settings.voiceName,
        rate: settings.voiceRate,
        onError: (code) => {
          if (code === 'not-allowed' || code === 'not-started') setNeedsTap(true);
        },
        onEnd: () => {
          if (useAssistant.getState().state === 'speaking') setState('idle');
          // Conversa contínua: após responder, escuta mais uma vez sem precisar de “Luna”
          if (continueAfter) setTimeout(() => startListeningRef.current(true), 450);
        },
      });
    },
    [muted, settings, tts, setState],
  );

  const sendVoice = useCallback(
    async (t: string, continueAfter = false) => {
      const res = await send(t, 'voice');
      if (res) speakReply(res.reply, continueAfter);
      else setState('idle');
    },
    [send, speakReply, setState],
  );

  // Palavra de ativação (somente em primeiro plano e navegadores compatíveis)
  const wake = useWakeWord(
    wakeEnabled && localWake,
    sr.listening || state !== 'idle' || realtime.active || realtime.connecting || tts.speaking,
    (rest) => {
      playChime();
      setVoiceFocus(true);
      const command = rest.length > 2 ? rest : undefined;
      if (voiceMode === 'realtime') void realtime.start(command);
      else if (command) void sendVoice(command, true);
      else setTimeout(() => startListeningRef.current(true), 500);
    },
  );

  const startListening = (followUp = false) => {
    followUpRef.current = followUp;
    setVoiceFocus(true);
    setVoiceError(null);
    tts.cancel();
    tts.unlock();
    setState('listening');
    const ok = sr.start({
      onInterim: (t) => setInterim(t),
      onFinal: (t) => void sendVoice(t, followUp),
    });
    if (!ok) setState('idle');
  };
  startListeningRef.current = startListening;

  useEffect(() => {
    if (!sr.listening && state === 'listening' && voiceMode === 'basic' && !recorder.recording) {
      setState('idle');
      setInterim('');
    }
  }, [sr.listening]); // eslint-disable-line react-hooks/exhaustive-deps

  const transcribeAndSend = async () => {
    const blob = await recorder.stop();
    if (!blob) return setState('idle');
    setState('processing');
    try {
      const form = new FormData();
      form.append('file', blob, blob.type.includes('mp4') ? 'audio.mp4' : 'audio.webm');
      const r = await api<{ text: string }>('/api/voice/transcribe', { form });
      if (r.text) await sendVoice(r.text);
      else setState('idle');
    } catch (err) {
      setVoiceError(errorMessage(err));
      setState('idle');
    }
  };

  const onMic = async () => {
    if (state === 'speaking') {
      tts.cancel();
      if (realtime.active) realtime.interrupt();
      setState(realtime.active ? 'listening' : 'idle');
      return;
    }
    if (voiceMode === 'realtime') {
      if (realtime.active || realtime.connecting) realtime.stop();
      else {
        setVoiceFocus(true);
        await realtime.start();
      }
      return;
    }
    if (recorder.recording) return transcribeAndSend();
    if (sr.listening) return sr.stop();
    if (sr.supported) return startListening(false);
    if (settings?.allowCloudTranscription && recorder.supported) {
      try {
        tts.unlock();
        await recorder.start();
        setVoiceFocus(true);
        setState('listening');
      } catch {
        setVoiceError('Permissão do microfone negada.');
      }
      return;
    }
    setVoiceError('Seu navegador não reconhece fala. Ative “Transcrição na nuvem” ou a “Voz em tempo real” em Configurações.');
  };

  // Se o reconhecimento do sistema for negado no iPhone, oferece o fallback por gravação
  useEffect(() => {
    if (sr.error && !(followUpRef.current && /Não ouvi nada/.test(sr.error))) setVoiceError(sr.error);
  }, [sr.error]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text;
    setText('');
    tts.unlock();
    await send(t, 'text');
    inputRef.current?.focus();
  };

  const vh = useViewportHeight();

  const voiceBusy = realtime.active || realtime.connecting || sr.listening || recorder.recording || (voiceFocus && state !== 'idle' && state !== 'error');
  useEffect(() => {
    if (!voiceFocus || voiceBusy) return;
    const t = setTimeout(() => {
      setVoiceFocus(false);
      // Conversa por voz encerrada: a tela volta limpa (o histórico fica salvo em “Conversas”)
      setTimeout(() => useAssistant.getState().state === 'idle' && newConversation(), 500);
    }, 2500);
    return () => clearTimeout(t);
  }, [voiceFocus, voiceBusy, newConversation]);
  const lastMsg = messages[messages.length - 1];
  // A resposta só aparece se for a mais recente (não mostra a resposta anterior enquanto pensa)
  const lastReply = lastMsg?.role === 'assistant' ? lastMsg.content : '';
  const lastHeard = interim || ([...messages].reverse().find((m) => m.role === 'user')?.content ?? '');

  // ---- Modo ambiente: entra após 45 s sem uso, sai com toque ou quando a Luna é chamada ----
  const ambientEnabled = useSettings((s) => s.ambientMode);
  const [ambient, setAmbient] = useState(false);
  const lastUse = useRef(Date.now());
  useEffect(() => {
    const touch = () => (lastUse.current = Date.now());
    const evts = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    evts.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    return () => evts.forEach((e) => window.removeEventListener(e, touch));
  }, []);
  useEffect(() => {
    lastUse.current = Date.now();
    if (state !== 'idle') setAmbient(false);
  }, [state, messages.length]);
  useEffect(() => {
    if (!ambientEnabled) return setAmbient(false);
    const t = setInterval(() => {
      const busy = state !== 'idle' || sr.listening || recorder.recording || realtime.active || realtime.connecting || text.length > 0;
      if (!busy && document.visibilityState === 'visible' && Date.now() - lastUse.current > 45_000) {
        setAmbient(true);
        newConversation(); // volta limpa ao sair do modo ambiente
      }
    }, 3000);
    return () => clearInterval(t);
  }, [ambientEnabled, state, sr.listening, recorder.recording, realtime.active, realtime.connecting, text]);
  const micActive = sr.listening || recorder.recording || realtime.active;
  const hasChat = messages.length > 0 || !!interim;
  const err = voiceError ?? realtime.error ?? wake.error;

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior */}
      <header className="flex items-center justify-between gap-3 border-b border-cyan-300/10 px-4 pt-safe pb-2 md:px-6 md:pt-4">
        <div className="flex items-center gap-3">
          <p className="hud-title hud-glow text-base font-bold text-cyan-50 md:hidden">LUNA</p>
          <div className="font-hud flex items-center gap-2 rounded-sm border border-cyan-300/20 bg-ink-900/70 px-2.5 py-1 text-xs font-semibold tracking-[0.18em] text-cyan-100/80 uppercase" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${STATE_DOT[state]}`} />
            {STATE_LABEL[state]}
            {(wake.armed || (realtime.active && settings?.wakeWordEnabled)) && state !== 'speaking' && (
              <span className="hidden text-cyan-300/60 sm:inline">· diga “Ei, Luna”</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted((m) => !m)}
            className="rounded-sm border border-cyan-300/20 bg-ink-900/70 p-2 text-cyan-200/80 hover:border-cyan-300/50"
            aria-label={muted ? 'Ativar voz das respostas' : 'Silenciar respostas'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          {hasChat && (
            <button
              onClick={() => {
                tts.cancel();
                newConversation();
              }}
              className="font-hud flex items-center gap-1 rounded-sm border border-cyan-300/20 bg-ink-900/70 px-3 py-1.5 text-xs font-semibold tracking-[0.14em] text-cyan-100/80 uppercase hover:border-cyan-300/50"
            >
              <Plus className="h-3.5 w-3.5" /> Nova
            </button>
          )}
        </div>
      </header>

      <div className="home-grid min-h-0 flex-1 px-4 pt-3 pb-3 md:pb-4 lg:px-6">
        {/* Painéis laterais (tablet, celular deitado e computador) */}
        <aside className="home-left min-h-0 flex-col gap-4 overflow-y-auto pb-2">
          <ClockPanel now={now} name={user?.displayName} greeting={greeting(now)} />
          <WeatherPanel data={weather.data} loading={weather.loading} error={weather.error} />
          <div className="home-left-extra">
            <DevicesPanel />
            <SensorsPanel />
            <SystemPanel />
          </div>
        </aside>

        {/* Centro: núcleo + conversa */}
        <section className="home-center flex min-h-0 flex-col">
          <div className={`flex flex-col items-center transition-all duration-500 ${hasChat ? 'pt-0' : 'pt-2 md:pt-6'}`}>
            {!hasChat && (
              <div className="mb-2 text-center md:hidden">
                <p className="hud-label">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}</p>
                <p className="hud-title hud-glow mt-1 text-4xl font-bold text-cyan-50 tabular-nums">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                <p className="font-hud mt-1 text-base text-cyan-100/70">
                  {greeting(now)}, <span className="font-bold text-cyan-300">{user?.displayName}</span>
                  {weather.data && <span className="text-cyan-100/50"> · {Math.round(weather.data.current.temperature)}° {weather.data.current.condition.toLowerCase()}</span>}
                </p>
              </div>
            )}
            <LunaOrb state={state} levelRef={realtime.levelRef} size={hasChat ? Math.min(150, Math.round(vh * 0.22)) : Math.max(150, Math.min(270, Math.round(vh * 0.42)))} onClick={onMic} label={STATE_LABEL[state]} />
            {!hasChat && (
              <p className="home-tall-only font-hud mt-3 max-w-sm text-center text-sm text-cyan-100/45">
                Toque no núcleo para falar · “acenda a luz da sala” · “vai chover hoje?”
              </p>
            )}
          </div>

          {err && (
            <div className="mt-3">
              <Banner onClose={() => setVoiceError(null)}>{err}</Banner>
            </div>
          )}

          <div className={`min-h-0 flex-1 overflow-y-auto ${hasChat ? 'mt-3' : ''}`}>
            <MessageList messages={messages} interim={interim} />
          </div>

          {/* Entrada de comando */}
          <form onSubmit={onSubmit} className="hud-panel mt-3 flex items-center gap-2 p-2">
            <span className="hud-label pl-2 text-cyan-300/60">›</span>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={micActive ? 'Ouvindo…' : 'Digite um comando para a Luna…'}
              className="font-hud min-w-0 flex-1 bg-transparent px-1 py-2 text-base text-cyan-50 placeholder-cyan-100/30 outline-none"
              enterKeyHint="send"
              autoComplete="off"
              maxLength={4000}
            />
            {text.trim() ? (
              <button type="submit" disabled={state === 'processing'} className="rounded-sm border border-cyan-300/60 bg-cyan-400/20 p-2.5 text-cyan-50 shadow-[0_0_12px_rgba(0,229,255,0.35)] disabled:opacity-50" aria-label="Enviar">
                <SendHorizontal className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onMic()}
                className={`rounded-sm border p-2.5 transition ${
                  micActive ? 'border-rose-400/70 bg-rose-500/25 text-rose-100 shadow-[0_0_14px_rgba(255,77,106,0.5)]' : 'border-cyan-300/60 bg-cyan-400/20 text-cyan-50 shadow-[0_0_12px_rgba(0,229,255,0.35)]'
                }`}
                aria-label={micActive ? 'Parar' : 'Falar'}
              >
                {realtime.connecting ? (
                  <AudioLines className="h-5 w-5 animate-pulse" />
                ) : state === 'speaking' ? (
                  <Square className="h-5 w-5" />
                ) : micActive ? (
                  <MicOff className="h-5 w-5" />
                ) : voiceMode === 'realtime' ? (
                  <AudioLines className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>
            )}
          </form>

          {/* Celular: painéis abaixo da conversa quando ainda não há mensagens */}
          {!hasChat && (
            <div className="home-mobile-only mt-4 flex flex-col gap-4">
              <DevicesPanel />
              <WeatherPanel data={weather.data} loading={weather.loading} error={weather.error} />
            </div>
          )}
        </section>

        {/* Coluna direita (computador): casa e diagnóstico */}
        <aside className="home-right min-h-0 flex-col gap-4 overflow-y-auto">
          <DevicesPanel />
          <SensorsPanel />
          <SystemPanel />
        </aside>
      </div>

      <VoiceFocus
        open={voiceFocus}
        state={state}
        levelRef={realtime.levelRef}
        heard={state === 'listening' ? interim : lastHeard}
        reply={state === 'listening' ? '' : lastReply}
        hint={voiceMode === 'realtime' ? 'Pode falar — estou ouvindo.' : 'Fale agora…'}
        onOrb={() => void onMic()}
        onClose={() => {
          tts.cancel();
          sr.abort();
          if (recorder.recording) void recorder.stop();
          if (realtime.active || realtime.connecting) realtime.stop();
          setInterim('');
          setState('idle');
          setVoiceFocus(false);
          setTimeout(newConversation, 500);
        }}
      />

      {ambient && (
        <AmbientMode
          now={now}
          weather={weather.data}
          hint={wake.armed ? 'Diga “Ei, Luna” ou toque na tela' : 'Toque na tela para voltar'}
          onExit={() => {
            lastUse.current = Date.now();
            setAmbient(false);
            tts.unlock();
          }}
        />
      )}

      {(needsTap || (wakeEnabled && !hasUserActivation())) &&
        createPortal(
        <button
          onClick={() => {
            tts.unlock();
            setNeedsTap(false);
            setTick((t) => t + 1);
          }}
          className="overlay-full z-[70] flex flex-col items-center justify-center gap-4 bg-ink-950/85 px-8 text-center"
        >
          <span className="hud-title hud-glow text-2xl font-bold text-cyan-50">TOQUE PARA ATIVAR</span>
          <span className="font-hud max-w-sm text-base text-cyan-100/70">
            O Android só libera o som e a voz da Luna depois de um toque na tela. É necessário uma vez cada vez que o app é aberto.
          </span>
        </button>,
          document.body,
        )}
    </div>
  );
}

/** O usuário já tocou na página desde que ela abriu? (requisito do navegador para áudio) */
function hasUserActivation() {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}
