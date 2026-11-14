import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AudioLines, Mic, MicOff, SendHorizontal, ShoppingCart, Square, Volume2, VolumeX, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LunaOrb } from '../components/LunaOrb';
import { ModernHome } from '../components/ModernHome';
import { nativeApp, type NativeVoiceEvent } from '../lib/native';
import { isModern } from '../lib/theme';
import { MessageList } from '../components/Messages';
import { CamerasPanel, EnvPanel, HomeRingPanel, LocationPanel, RoutinePanel, StatusPanel, VoicePanel } from '../components/HudPanels';
import { useCameras } from '../stores/cameras';
import { useAutomations, useHealth } from '../hooks/useHudData';
import { useDevices } from '../stores/devices';
import { AmbientMode } from '../components/AmbientMode';
import { RecadoAlert, RecadoButton, RecadosChips, useRecadoAnnounce } from '../components/Recados';
import { usePresenceStore } from '../hooks/usePresence';
import { unseenRecados, useRecados } from '../stores/recados';
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
import { takeSentences } from '../lib/speechText';

function useViewport() {
  const [v, setV] = useState(() => ({ w: typeof window === 'undefined' ? 400 : window.innerWidth, h: typeof window === 'undefined' ? 800 : window.innerHeight }));
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return v;
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
  // Dentro do app Android (tablet) o próprio app escuta o chamado “Oi, Luna” e reconhece a fala
  const inApp = nativeApp() !== null;
  const localWake = !inApp && wakeWordSupport('basic').supported;
  // No app com “Voz em tempo real”: a conversa é com a OpenAI, igual à Luna instalada no celular
  const appRealtime = inApp && voiceMode === 'realtime' && settings?.aiMode !== 'local' && !!nativeApp()?.setVoiceHandoff;

  const realtime = useRealtimeVoice({
    onState: setState,
    onTranscript: (role, t) => appendLocal({ role, content: t, channel: 'voice', provider: role === 'assistant' ? 'openai-realtime' : null }),
    conversationId,
    onConversation: setConversationId,
    wakeWord: !inApp && wakeEnabled && voiceMode === 'realtime' && !localWake,
    // No app a conversa termina sozinha depois de 30 s sem fala, devolvendo o microfone ao “Oi, Luna”
    autoStopMs: (wakeEnabled && localWake) || appRealtime ? 30_000 : undefined,
    onAudioBlocked: () => setNeedsTap(true),
  });

  // Conversa por voz em tela cheia: ativa ao começar a falar e some após ~2,5 s sem conversa
  const [voiceFocus, setVoiceFocus] = useState(false);

  // Android/Chrome só libera áudio depois de um toque na tela (política de autoplay)
  const [needsTap, setNeedsTap] = useState(false);
  useEffect(() => {
    if (!needsTap) return;
    const release = () => {
      tts.unlock();
      setNeedsTap(false);
    };
    window.addEventListener('pointerdown', release, { once: true });
    return () => window.removeEventListener('pointerdown', release);
  }, [needsTap]); // eslint-disable-line react-hooks/exhaustive-deps
  const followUpRef = useRef(false);
  const startListeningRef = useRef<(followUp?: boolean) => void>(() => undefined);

  /**
   * Envia por voz e FALA EM FLUXO: cada frase pronta entra na fila de fala enquanto o
   * modelo ainda gera o resto — a Luna começa a responder bem antes de terminar de pensar.
   */
  const sendVoice = useCallback(
    async (t: string, continueAfter = false) => {
      const canSpeak = !muted && Boolean(settings?.autoSpeak) && tts.supported;
      const opts = {
        voiceName: settings?.voiceName,
        rate: settings?.voiceRate,
        onError: (code: string) => {
          if (code === 'not-allowed' || code === 'not-started') setNeedsTap(true);
        },
      };
      let buffer = '';
      let spoke = false;
      const res = await send(
        t,
        'voice',
        canSpeak
          ? (piece) => {
              buffer += piece;
              const { ready, rest } = takeSentences(buffer);
              buffer = rest;
              for (const sentence of ready) {
                if (!spoke) {
                  spoke = true;
                  setState('speaking');
                }
                tts.enqueue(sentence, opts);
              }
            }
          : undefined,
      );
      if (!res) {
        tts.cancel();
        setState('idle');
        return;
      }
      if (!canSpeak) {
        setState('idle');
        return;
      }
      // Respostas diretas (comandos da casa, hora, clima) chegam inteiras
      tts.enqueue(spoke ? buffer : res.reply, opts);
      setState('speaking');
      tts.finishQueue(() => {
        if (useAssistant.getState().state === 'speaking') setState('idle');
        if (continueAfter) setTimeout(() => startListeningRef.current(true), 450);
      });
    },
    [send, muted, settings, tts, setState],
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
    if (inApp && !appRealtime) return nativeApp()!.listen();
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

  const { w: vw, h: vh } = useViewport();

  // Conversa pelo chamado “Oi, Luna” do app Android: mostra a tela de voz (nuvem) com o que ouviu e respondeu
  const [nativeVoice, setNativeVoice] = useState<{ heard: string; reply: string } | null>(null);
  useEffect(() => {
    if (!inApp) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent<NativeVoiceEvent>).detail;
      if (d.state !== 'idle') setVoiceFocus(true);
      setNativeVoice({ heard: d.heard, reply: d.reply });
      setState(d.state === 'error' ? 'idle' : d.state);
    };
    window.addEventListener('dia-native-voice', on);
    return () => window.removeEventListener('dia-native-voice', on);
  }, [inApp, setState]);

  const voiceBusy = realtime.active || realtime.connecting || sr.listening || recorder.recording || tts.speaking || (voiceFocus && state !== 'idle' && state !== 'error');
  useEffect(() => {
    if (!voiceFocus || voiceBusy) return;
    const t = setTimeout(() => {
      setVoiceFocus(false);
      setTimeout(() => setNativeVoice(null), 500);
      // Conversa por voz encerrada: a tela volta limpa (o histórico fica salvo em “Conversas”)
      setTimeout(() => useAssistant.getState().state === 'idle' && newConversation(), 500);
    }, 2500);
    return () => clearTimeout(t);
  }, [voiceFocus, voiceBusy, newConversation]);
  const lastMsg = messages[messages.length - 1];
  // A resposta só aparece se for a mais recente (não mostra a resposta anterior enquanto pensa)
  const lastReply = lastMsg?.role === 'assistant' ? lastMsg.content : '';
  const lastHeard = interim || ([...messages].reverse().find((m) => m.role === 'user')?.content ?? '');

  // ---- Descanso de tela: entra após o tempo escolhido sem uso, sai com toque ou quando a Luna é chamada ----
  const ambientEnabled = useSettings((s) => s.ambientMode);
  const ambientDelay = useSettings((s) => s.ambientDelay);
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
      if (!busy && document.visibilityState === 'visible' && Date.now() - lastUse.current > ambientDelay * 1000) {
        setAmbient(true);
        newConversation(); // volta limpa ao sair do modo ambiente
      }
    }, 3000);
    return () => clearInterval(t);
  }, [ambientEnabled, ambientDelay, state, sr.listening, recorder.recording, realtime.active, realtime.connecting, text]);
  const micActive = sr.listening || recorder.recording || realtime.active;
  // App Android: avisa se a tela conduz a conversa e pausa o “Oi, Luna” enquanto a conversa usa o microfone
  useEffect(() => {
    nativeApp()?.setVoiceHandoff?.(appRealtime);
    return () => nativeApp()?.setVoiceHandoff?.(false);
  }, [appRealtime]);
  const rtBusy = realtime.active || realtime.connecting;
  useEffect(() => {
    if (!appRealtime) return;
    nativeApp()?.pauseWake?.(rtBusy);
  }, [rtBusy, appRealtime]);
  useEffect(() => {
    if (!appRealtime) return;
    const onWakeWord = () => {
      if (realtime.active || realtime.connecting) return;
      setAmbient(false);
      setVoiceFocus(true);
      void realtime.start();
    };
    window.addEventListener('dia-native-wakeword', onWakeWord);
    return () => window.removeEventListener('dia-native-wakeword', onWakeWord);
  }, [appRealtime, realtime]);
  // Saiu do descanso de tela: se há recado novo, ele aparece para quem chegou
  const leaveAmbient = () => {
    lastUse.current = Date.now();
    setAmbient(false);
    if (unseenRecados(useRecados.getState().list).length && !useRecados.getState().view) useRecados.getState().open('player');
  };
  // Câmera do aparelho: alguém chegou perto da tela
  const nearAt = usePresenceStore((s) => s.nearAt);
  const presenceWake = useSettings((s) => s.presenceWake);
  useRecadoAnnounce(nearAt);
  useEffect(() => {
    if (!nearAt || !presenceWake) return;
    lastUse.current = Date.now();
    if (ambient) leaveAmbient();
  }, [nearAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Dados dos painéis HUD ----
  const health = useHealth();
  const rules = useAutomations();
  const cameraList = useCameras((s) => s.cameras);
  useEffect(() => {
    if (!cameraList) void useCameras.getState().load();
  }, [cameraList]);
  const serverConnected = useAssistant((s) => s.serverConnected);
  const haConnected = useDevices((s) => s.haConnected);
  const allDevices = useDevices((s) => s.devices);
  const controllable = Object.values(allDevices).filter((d) => d.controllable && !d.hidden);
  const devicesTotal = controllable.length;
  const lightsOn = controllable.filter((d) => d.domain === 'light' && d.isOn).length;
  const nextRain = weather.data?.hourly.find((h) => h.precipitationProbability >= 40);
  const rainTag = weather.data ? (nextRain ? `Chuva às ${Number(nextRain.time.slice(11, 13))}h` : 'Sem chuva prevista') : 'Clima';
  const aiTag = `IA ${settings?.aiMode === 'local' ? 'local' : settings?.aiMode === 'cloud' ? 'nuvem' : 'híbrida'}${health?.services.ollama.ok ? ` · ${health.services.ollama.model}` : ''}`;
  const place = settings?.homeLocation?.name ?? weather.data?.location.name ?? (useSettings.getState().useGps ? 'Localização atual' : 'Defina em Ajustes');
  const coords = weather.data ? `${weather.data.location.latitude.toFixed(2)}, ${weather.data.location.longitude.toFixed(2)}` : null;
  const hasChat = messages.length > 0 || !!interim;
  /** Fecha a janela de conversa e volta à tela inicial (o histórico fica salvo em “Conversas”). */
  const closeChat = () => {
    tts.cancel();
    setText('');
    setInterim('');
    newConversation();
    inputRef.current?.blur();
  };
  // Esc também fecha a conversa (teclado, tablet ou TV)
  useEffect(() => {
    if (!hasChat || voiceFocus) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeChat();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const wide = vw >= 900 && vh > 560;
  const short = vh <= 560;
  const orbSize = hasChat
    ? Math.round(Math.min(150, vh * 0.2))
    : Math.round(wide ? Math.min(vh * 0.46, 430) : short ? Math.min(vh * 0.36, 190) : Math.min(vw * 0.72, vh * 0.36, 360));
  const err = voiceError ?? realtime.error ?? wake.error;
  const theme = useSettings((s) => s.theme);
  const gestureWatch = useSettings((s) => s.gestureWatch);
  const micIcon = realtime.connecting ? (
    <AudioLines className="h-6 w-6 animate-pulse" />
  ) : state === 'speaking' ? (
    <Square className="h-6 w-6" />
  ) : micActive ? (
    <MicOff className="h-6 w-6" />
  ) : voiceMode === 'realtime' ? (
    <AudioLines className="h-6 w-6" />
  ) : (
    <Mic className="h-6 w-6" />
  );

  return (
    <div className="flex h-full flex-col">
      {isModern(theme) ? (
        <ModernHome
          now={now}
          greeting={greeting(now)}
          userName={user?.displayName?.split(' ')[0] ?? ''}
          state={state}
          stateLabel={state !== 'idle' ? STATE_LABEL[state] : wake.armed || (realtime.active && settings?.wakeWordEnabled) ? 'Ouvindo “Oi, Luna”' : 'Disponível'}
          aiTag={settings?.aiMode === 'local' ? 'IA local' : settings?.aiMode === 'cloud' ? 'IA nuvem' : 'IA híbrida'}
          hasChat={hasChat}
          messages={messages}
          interim={interim}
          levelRef={realtime.levelRef}
          onMic={() => void onMic()}
          micActive={micActive}
          micIcon={micIcon}
          text={text}
          setText={setText}
          onSubmit={onSubmit}
          inputRef={inputRef}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onCloseChat={closeChat}
          weather={weather.data}
          health={health}
          cameras={cameraList}
          banner={
            err ? (
              <div className="mb-3">
                <Banner onClose={() => setVoiceError(null)}>{err}</Banner>
              </div>
            ) : null
          }
          wide={wide}
          vw={vw}
          vh={vh}
          gesturesOn={gestureWatch}
        />
      ) : (
      <>
      {/* Cabeçalho: comando de voz · LUNA + hora · ações */}
      <header className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-4 pt-safe md:px-8 md:pt-5 [@media(max-height:560px)]:pt-2">
        <div className="font-hud flex min-w-0 items-center gap-2 justify-self-start border border-cyan-300/25 bg-ink-950/75 px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-cyan-300/85 uppercase [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)] md:px-3.5 md:text-xs" aria-live="polite">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[state]}`} />
          <span className="truncate">
            {state !== 'idle' ? STATE_LABEL[state] : wake.armed || (realtime.active && settings?.wakeWordEnabled) ? <>Comando de voz · <b className="text-emerald-300">Luna</b></> : 'Disponível'}
          </span>
        </div>
        <div className={`text-center transition-opacity ${hasChat ? 'max-md:hidden' : ''}`}>
          <p className="hud-title text-[11px] tracking-[0.6em] text-cyan-100 [text-shadow:0_0_10px_#00e5ff] md:text-sm [@media(max-height:560px)]:hidden">Luna</p>
          <div className="flex items-center justify-center gap-3">
            <p className="hud-title hud-glow text-4xl leading-tight font-bold text-cyan-50 tabular-nums md:text-5xl [@media(max-height:560px)]:text-2xl">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            <RecadoButton compact />
          </div>
          <p className="hud-label text-[10px] md:text-xs [@media(max-height:560px)]:hidden">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <button onClick={() => setMuted((m) => !m)} className="rounded-sm border border-cyan-300/25 bg-ink-950/75 p-2 text-cyan-200/80 hover:border-cyan-300/50" aria-label={muted ? 'Ativar voz das respostas' : 'Silenciar respostas'}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          {hasChat && (
            <button
              onClick={closeChat}
              aria-label="Fechar conversa"
              className="font-hud flex items-center gap-1 rounded-sm border border-cyan-300/25 bg-ink-950/75 px-2.5 py-1.5 text-xs font-semibold tracking-[0.14em] text-cyan-100/80 uppercase hover:border-cyan-300/50"
            >
              <X className="h-3.5 w-3.5" /> Fechar
            </button>
          )}
        </div>
      </header>

      <div className="home3d hud3d-mid relative z-10 min-h-0 flex-1 gap-4 px-4 pt-3 pb-2 md:px-8">
        {/* Celular em pé: três mini painéis (também ampliam ao tocar) */}
        {!hasChat && (
          <div className="strip strip-tilt grid-cols-3 gap-2">
            <EnvPanel weather={weather.data} mini />
            <HomeRingPanel mini />
            <StatusPanel health={health} server={serverConnected} ha={haConnected} mini />
          </div>
        )}

        <div className="side">
          <div className="hud3d-col l col-l flex flex-col gap-3">
            <StatusPanel health={health} server={serverConnected} ha={haConnected} />
            <EnvPanel weather={weather.data} />
            <VoicePanel messages={messages} state={state} />
          </div>
          <div className="hud3d-col r col-r flex flex-col gap-3">
            {cameraList && cameraList.length > 0 && <CamerasPanel cameras={cameraList} />}
            <LocationPanel place={place} coords={coords} />
            <RoutinePanel rules={rules} />
            <HomeRingPanel />
          </div>
        </div>

        {/* Centro: globo, etiquetas, conversa e campo de comando */}
        <section className="center flex min-h-0 flex-col">
          <div className={`relative flex items-center justify-center ${hasChat ? 'pt-1' : 'flex-1'}`} style={{ minHeight: orbSize + 20 }}>
            <div className="radar-floor" style={{ width: orbSize * 1.35, bottom: -orbSize * 0.18 }} />
            <LunaOrb state={state} levelRef={realtime.levelRef} size={orbSize} onClick={onMic} label={hasChat ? undefined : STATE_LABEL[state]} />
            {!hasChat && (
              <>
                <span className="hud-tag tl" style={{ left: 0, top: '14%' }}>{lightsOn} {lightsOn === 1 ? 'luz acesa' : 'luzes acesas'}</span>
                <span className="hud-tag tr" style={{ right: 0, top: '22%' }}>{rainTag}</span>
                <span className="hud-tag bl max-md:hidden [@media(max-height:560px)]:hidden" style={{ left: '2%', bottom: '18%' }}>{aiTag}</span>
                <span className="hud-tag br max-md:hidden [@media(max-height:560px)]:hidden" style={{ right: '2%', bottom: '12%' }}>{devicesTotal} dispositivos</span>
              </>
            )}
          </div>

          {err && (
            <div className="mt-2">
              <Banner onClose={() => setVoiceError(null)}>{err}</Banner>
            </div>
          )}

          {hasChat && (
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              <MessageList messages={messages} interim={interim} />
            </div>
          )}

          <div className="mt-3">
            <RecadoAlert />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <RecadosChips chipClass="font-hud flex items-center gap-1.5 rounded-sm border border-cyan-300/40 bg-ink-950/70 px-3 py-1.5 text-xs text-cyan-50 [&.act]:border-amber-300/70 [&.act]:bg-amber-400/15" />
            <Link to="/listas" className="font-hud flex items-center gap-1.5 rounded-sm border border-cyan-300/40 bg-ink-950/70 px-3 py-1.5 text-xs text-cyan-50">
              <ShoppingCart className="h-4 w-4" /> Listas
            </Link>
          </div>
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
        </section>
      </div>
      </>
      )}

      <VoiceFocus
        open={voiceFocus}
        state={state}
        levelRef={realtime.levelRef}
        heard={nativeVoice ? nativeVoice.heard : state === 'listening' ? interim : lastHeard}
        reply={nativeVoice ? (state === 'listening' ? '' : nativeVoice.reply) : state === 'listening' ? '' : lastReply}
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
          setNativeVoice(null);
          setTimeout(newConversation, 500);
        }}
      />

      {ambient && (
        <AmbientMode
          now={now}
          weather={weather.data}
          hint={wake.armed ? 'Diga “Oi, Luna” ou toque na tela' : 'Toque na tela para voltar'}
          onExit={() => {
            leaveAmbient();
            tts.unlock();
          }}
        />
      )}

      {needsTap &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[70] flex justify-center px-4">
            <div className="font-hud animate-fade-up rounded-sm border border-amber-300/50 bg-ink-950/95 px-4 py-2 text-sm text-amber-100 shadow-[0_0_16px_rgba(255,181,71,0.25)]">
              🔊 Toque em qualquer lugar da tela para liberar a voz da Luna
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

