import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AudioLines, Mic, MicOff, Plus, SendHorizontal, Square, Volume2, VolumeX } from 'lucide-react';
import { LunaOrb } from '../components/LunaOrb';
import { MessageList } from '../components/Messages';
import { WeatherIcon } from '../components/WeatherIcon';
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

const STATE_DOT: Record<string, string> = {
  idle: 'bg-emerald-400',
  listening: 'bg-cyan-400 animate-pulse',
  processing: 'bg-violet-400 animate-pulse',
  acting: 'bg-amber-400 animate-pulse',
  speaking: 'bg-blue-400 animate-pulse',
  error: 'bg-rose-500',
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
  });

  const speakReply = useCallback(
    (reply: string) => {
      if (muted || !settings?.autoSpeak || !tts.supported) return;
      setState('speaking');
      tts.speak(reply, { voiceName: settings.voiceName, rate: settings.voiceRate, onEnd: () => useAssistant.getState().state === 'speaking' && setState('idle') });
    },
    [muted, settings, tts, setState],
  );

  const sendVoice = useCallback(
    async (t: string) => {
      const res = await send(t, 'voice');
      if (res) speakReply(res.reply);
    },
    [send, speakReply],
  );

  // Palavra de ativação (somente em primeiro plano e navegadores compatíveis)
  const wake = useWakeWord(wakeEnabled && localWake, sr.listening || state !== 'idle' || realtime.active || realtime.connecting, (rest) => {
    playChime();
    tts.unlock();
    const command = rest.length > 2 ? rest : undefined;
    if (voiceMode === 'realtime') void realtime.start(command);
    else if (command) void sendVoice(command);
    else setTimeout(startListening, 350);
  });

  const startListening = () => {
    setVoiceError(null);
    tts.cancel();
    tts.unlock();
    setState('listening');
    const ok = sr.start({
      onInterim: (t) => setInterim(t),
      onFinal: (t) => void sendVoice(t),
    });
    if (!ok) setState('idle');
  };

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
      else await realtime.start();
      return;
    }
    if (recorder.recording) return transcribeAndSend();
    if (sr.listening) return sr.stop();
    if (sr.supported) return startListening();
    if (settings?.allowCloudTranscription && recorder.supported) {
      try {
        tts.unlock();
        await recorder.start();
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
    if (sr.error) setVoiceError(sr.error);
  }, [sr.error]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text;
    setText('');
    tts.unlock();
    await send(t, 'text');
    inputRef.current?.focus();
  };

  const micActive = sr.listening || recorder.recording || realtime.active;
  const hasChat = messages.length > 0 || !!interim;
  const level = realtime.active ? realtime.level : 0;
  const err = voiceError ?? realtime.error;

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho */}
      <header className="flex items-center justify-between px-4 pt-safe pb-2 md:px-8 md:pt-6">
        <div className="flex items-center gap-2 md:hidden">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold">
            Luna <span className="text-gradient">AI</span>
          </span>
        </div>
        <div className="glass hidden items-center gap-2 rounded-full px-3 py-1 text-xs md:flex" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${STATE_DOT[state]}`} />
          {STATE_LABEL[state]}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMuted((m) => !m)} className="glass rounded-full p-2 text-white/70" aria-label={muted ? 'Ativar voz das respostas' : 'Silenciar respostas'}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          {hasChat && (
            <button
              onClick={() => {
                tts.cancel();
                newConversation();
              }}
              className="glass flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-white/80"
            >
              <Plus className="h-3.5 w-3.5" /> Nova conversa
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col px-4">
        {/* Saudação, hora e clima */}
        <section className={`flex flex-col items-center text-center transition-all ${hasChat ? 'pt-1' : 'pt-4 md:pt-10'}`}>
          {!hasChat && (
            <>
              <p className="text-sm text-white/50 capitalize">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                {greeting(now)}, <span className="text-gradient">{user?.displayName}</span>
              </h1>
            </>
          )}
          <div className="mt-2 flex items-center gap-3 text-sm text-white/70">
            <span className="text-lg font-medium tabular-nums">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            {weather.data ? (
              <Link to="/clima" className="glass flex items-center gap-1.5 rounded-full px-3 py-1">
                <WeatherIcon code={weather.data.current.weatherCode} isDay={weather.data.current.isDay} className="h-4 w-4" />
                {Math.round(weather.data.current.temperature)}° · {weather.data.current.condition}
              </Link>
            ) : (
              <Link to="/clima" className="glass rounded-full px-3 py-1 text-xs text-white/50">
                {weather.loading ? 'Carregando clima…' : weather.error ? 'Clima indisponível' : 'Definir localização'}
              </Link>
            )}
          </div>

          <div className={`transition-all duration-500 ${hasChat ? 'my-3' : 'my-8 md:my-12'}`}>
            <LunaOrb state={state} level={level} size={hasChat ? 96 : 210} onClick={onMic} />
          </div>
          <p className="text-sm text-white/60 md:hidden" aria-live="polite">
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${STATE_DOT[state]}`} />
            {STATE_LABEL[state]}
            {wake.armed && state === 'idle' && ' · diga “Ei, Luna”'}
            {realtime.active && settings?.wakeWordEnabled && state === 'listening' && ' · diga “Ei, Luna”'}
          </p>
          {!hasChat && (
            <p className="mt-3 max-w-sm text-sm text-white/40">
              Toque na Luna ou no microfone para falar. Experimente: “acenda a luz da sala” ou “vai chover hoje?”
            </p>
          )}
        </section>

        {err && (
          <Banner onClose={() => setVoiceError(null)}>
            {err}
          </Banner>
        )}

        {/* Conversa */}
        <section className="min-h-0 flex-1 overflow-y-auto pb-2">
          <MessageList messages={messages} interim={interim} />
        </section>

        {/* Entrada */}
        <form onSubmit={onSubmit} className="glass mb-24 flex items-center gap-2 rounded-2xl p-2 md:mb-6">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={micActive ? 'Ouvindo…' : 'Pergunte algo à Luna…'}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base text-white placeholder-white/35 outline-none"
            enterKeyHint="send"
            autoComplete="off"
            maxLength={4000}
          />
          {text.trim() ? (
            <button type="submit" disabled={state === 'processing'} className="rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 p-2.5 text-white disabled:opacity-50" aria-label="Enviar">
              <SendHorizontal className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onMic()}
              className={`rounded-xl p-2.5 transition ${micActive ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-gradient-to-r from-violet-500 to-cyan-500 text-white'}`}
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
      </div>
    </div>
  );
}
