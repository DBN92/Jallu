import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cctv, ChevronRight, CloudSun, Fan, Lightbulb, Moon, Plug, Power, SendHorizontal, Sparkles, Sun, Thermometer, Volume2, VolumeX, X } from 'lucide-react';
import type { AssistantState, CameraDto, DeviceDto, HealthDto, WeatherDto } from '@luna/shared/types';
import { useDevices } from '../stores/devices';
import { useCameras } from '../stores/cameras';
import type { UiMessage } from '../stores/assistant';
import { LunaOrb } from './LunaOrb';
import { MessageList } from './Messages';
import { CameraThumb } from './CameraPlayer';
import { WeatherIcon } from './WeatherIcon';
import { GarageCard } from './GarageCard';
import { VacuumCard } from './VacuumCard';
import { LitterCard } from './LitterCard';

type Filter = 'all' | 'lighting' | 'outlets' | 'other';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'lighting', label: 'Luzes' },
  { id: 'outlets', label: 'Tomadas' },
  { id: 'other', label: 'Outros' },
];
const isToggle = (d: DeviceDto) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors' && d.domain !== 'vacuum';
const iconFor = (d: DeviceDto) => (d.category === 'lighting' ? Lightbulb : d.category === 'outlets' ? Plug : d.category === 'climate' ? (d.entityId.startsWith('fan.') ? Fan : Thermometer) : Power);
const round = Math.round;

export interface ModernHomeProps {
  now: Date;
  greeting: string;
  userName: string;
  state: AssistantState;
  stateLabel: string;
  aiTag: string;
  hasChat: boolean;
  messages: UiMessage[];
  interim: string;
  levelRef: { current: number };
  onMic: () => void;
  micActive: boolean;
  micIcon: ReactNode;
  text: string;
  setText: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  muted: boolean;
  onToggleMute: () => void;
  /** Fecha a janela de conversa (volta à tela inicial) */
  onCloseChat: () => void;
  weather: WeatherDto | null;
  health: HealthDto | null;
  cameras: CameraDto[] | null;
  banner: ReactNode;
  wide: boolean;
  vw: number;
  vh: number;
  /** Análise de gestos ligada neste aparelho */
  gesturesOn: boolean;
}

/** Tela inicial dos temas modernos: cartões arredondados, nuvem de partículas da Luna e controles diretos. */
export function ModernHome(p: ModernHomeProps) {
  const navigate = useNavigate();
  const devicesMap = useDevices((s) => s.devices);
  const busy = useDevices((s) => s.busy);
  const openCameras = useCameras((s) => s.open);
  const [filter, setFilter] = useState<Filter>('all');
  const trackRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const scrollRaf = useRef(0);
  const onTrackScroll = () => {
    cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const el = trackRef.current;
      if (el && el.clientWidth) setSlide(Math.round(el.scrollLeft / el.clientWidth));
    });
  };
  const goTo = (i: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  // Ao falar com a Luna (ou chegar resposta), volta para o cartão da Luna
  useEffect(() => {
    if (p.state !== 'idle' || p.hasChat) goTo(0);
  }, [p.state, p.hasChat]);

  const toggles = useMemo(
    () =>
      Object.values(devicesMap)
        .filter(isToggle)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), // ordem fixa: o cartão não “pula” ao ligar
    [devicesMap],
  );
  const shown = toggles.filter((d) => filter === 'all' || (filter === 'outlets' ? d.category === 'outlets' || d.category === 'switches' : filter === 'other' ? !['lighting', 'outlets', 'switches'].includes(d.category) : d.category === filter));
  const lights = toggles.filter((d) => d.category === 'lighting');
  const onCount = toggles.filter((d) => d.isOn).length;
  const rain = p.weather?.hourly.slice(0, 12).find((h) => h.precipitationProbability >= 40);

  const allLights = async (on: boolean) => {
    for (const d of lights.filter((l) => l.isOn === !on)) await useDevices.getState().toggle(d);
  };

  // Celular deitado: pouca altura → duas colunas, cartão da Luna mais baixo
  const land = !p.wide && p.vw > p.vh && p.vh <= 520;
  const waveW = p.wide ? Math.min(460, p.vw * 0.34) : land ? Math.min(p.vw * 0.42 - 70, 420) : Math.min(p.vw - 76, 460);

  // ---------- Carrossel do cartão: Luna · Sistema · Casa agora ----------
  const sys = p.health?.system;
  const services = p.health?.services;
  const allOk = !!services && services.database.ok && services.homeAssistant.ok && (services.ollama.ok || services.openai.ok);
  const problems = services
    ? [!services.homeAssistant.ok && 'Home Assistant', !services.ollama.ok && 'IA local', !services.database.ok && 'banco de dados'].filter(Boolean)
    : [];
  const uptime = sys ? (sys.serverUptimeHours >= 24 ? `${Math.floor(sys.serverUptimeHours / 24)} ${Math.floor(sys.serverUptimeHours / 24) === 1 ? 'dia' : 'dias'}` : sys.serverUptimeHours < 1 ? 'menos de 1 h' : `${Math.round(sys.serverUptimeHours)} h`) : null;
  const outlets = toggles.filter((d) => d.category === 'outlets' || d.category === 'switches');
  const camsOnline = (p.cameras ?? []).filter((c) => c.available).length;
  const last = p.health?.lastCommand;

  const slideLuna = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="m-label">Luna</p>
          <p className="mt-1 text-lg font-semibold">{p.stateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="m-chip" style={{ padding: '6px 12px', fontSize: 12 }}>
            <Sparkles className="h-4 w-4" />
            {p.aiTag}
          </span>
          <button onClick={p.onToggleMute} className="m-iconbox" style={{ width: 36, height: 36, borderRadius: 12 }} aria-label={p.muted ? 'Ativar voz das respostas' : 'Silenciar respostas'}>
            {p.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          {p.hasChat && (
            <button onClick={p.onCloseChat} className="m-iconbox" style={{ width: 36, height: 36, borderRadius: 12 }} aria-label="Fechar conversa" title="Fechar conversa">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="my-3 flex justify-center">
        <LunaOrb state={p.state} levelRef={p.levelRef} size={waveW} height={p.hasChat ? (land ? 48 : 76) : p.wide ? 200 : land ? 84 : 150} onClick={p.onMic} />
      </div>
      {p.hasChat && (
        <div className="mb-3 max-h-[38vh] min-h-0 overflow-y-auto">
          <MessageList messages={p.messages} interim={p.interim} />
        </div>
      )}
      {p.banner}
      <div className="flex items-center gap-4">
        <button onClick={p.onMic} className={`m-mic ${p.micActive ? 'live' : ''}`} aria-label={p.micActive ? 'Parar' : 'Falar com a Luna'}>
          {p.micIcon}
        </button>
        <form onSubmit={p.onSubmit} className="m-input flex-1">
          <input
            ref={p.inputRef}
            value={p.text}
            onChange={(e) => p.setText(e.target.value)}
            placeholder={p.micActive ? 'Ouvindo…' : 'Diga “Oi, Luna” ou digite…'}
            enterKeyHint="send"
            autoComplete="off"
            maxLength={4000}
          />
          {p.text.trim() && (
            <button type="submit" aria-label="Enviar">
              <SendHorizontal className="h-5 w-5" />
            </button>
          )}
        </form>
      </div>
    </>
  );

  const slideSystem = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="m-label">Sistema</p>
          <p className="mt-1 text-lg font-semibold">{!services ? 'Verificando…' : allOk ? 'Tudo funcionando' : `Atenção: ${problems.join(', ')}`}</p>
        </div>
        <span className="m-chip" style={{ padding: '6px 12px', fontSize: 12, color: allOk ? '#6ee7b7' : '#fda4af' }}>● {allOk ? 'online' : 'verificar'}</span>
      </div>
      <div className="my-4 flex justify-around">
        <Ring label="CPU" value={sys?.cpuPercent ?? null} text={sys ? `${sys.cpuPercent}%` : '—'} />
        <Ring label="Memória" value={sys?.memoryPercent ?? null} text={sys ? `${sys.memoryPercent}%` : '—'} />
        {sys?.temperatureC != null && <Ring label="Temperatura" value={Math.min(100, (sys.temperatureC / 95) * 100)} text={`${sys.temperatureC}°`} warm />}
      </div>
      <div className="text-sm">
        {[
          ['Home Assistant', services?.homeAssistant.ok, services?.homeAssistant.ok ? 'conectado' : 'offline'],
          [`IA local${services?.ollama.model ? ` · ${services.ollama.model}` : ''}`, services?.ollama.ok, services?.ollama.ok ? 'pronta' : 'offline'],
          ['IA na nuvem (OpenAI)', services?.openai.configured ? services.openai.ok : null, services?.openai.configured ? (services.openai.ok ? 'pronta' : 'erro') : 'desligada'],
        ].map(([n, ok, t]) => (
          <div key={String(n)} className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0">
            <span className="min-w-0 truncate">{n}</span>
            <span className={`flex shrink-0 items-center gap-2 ${ok ? 'text-emerald-300' : ok === false ? 'text-rose-300' : 'm-muted'}`}>
              <i className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : ok === false ? 'bg-rose-400' : 'bg-white/30'}`} />
              {String(t)}
            </span>
          </div>
        ))}
      </div>
      <p className="m-muted mt-2 text-[12.5px]">
        Servidor{uptime ? ` ligado há ${uptime}` : ''}
        {p.health?.publicAccess?.configured ? ` · acesso de fora ${p.health.publicAccess.ok ? '● ok' : '● sem resposta'}` : ''}
      </p>
    </>
  );

  const stat = (label: string, value: ReactNode, sub?: string) => (
    <div className="rounded-[18px] bg-white/5 px-3.5 py-3">
      <p className="m-muted text-[12.5px]">{label}</p>
      <p className="m-num mt-0.5 text-2xl font-medium">
        {value}
        {sub && <span className="m-muted text-[15px]"> {sub}</span>}
      </p>
    </div>
  );
  const slideHome = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="m-label">Casa agora</p>
          <p className="mt-1 text-lg font-semibold">{lights.filter((d) => d.isOn).length === 1 ? '1 luz acesa' : `${lights.filter((d) => d.isOn).length} luzes acesas`}</p>
        </div>
        <span className="m-chip" style={{ padding: '6px 12px', fontSize: 12 }}>{toggles.length} aparelhos</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {stat('Luzes acesas', lights.filter((d) => d.isOn).length, `/ ${lights.length}`)}
        {stat('Tomadas ligadas', outlets.filter((d) => d.isOn).length, `/ ${outlets.length}`)}
        {stat('Câmeras online', camsOnline, `/ ${p.cameras?.length ?? 0}`)}
        {stat('Gestos', <span className="text-lg">{p.gesturesOn ? '✋ ativo' : 'desligado'}</span>)}
      </div>
      {last && (
        <p className="m-muted mt-3 truncate text-[12.5px]">
          Último pedido: “{last.text}” · {new Date(last.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {last.channel === 'voice' ? ' por voz' : ''}
        </p>
      )}
    </>
  );

  const slides = [slideLuna, slideSystem, slideHome];
  const hero = (
    <div className="m-card" style={{ padding: p.wide ? 24 : land ? 14 : 20 }}>
      <div ref={trackRef} className="m-carousel" onScroll={onTrackScroll}>
        {slides.map((sl, i) => (
          <section key={i} className="m-slide" aria-hidden={i !== slide} aria-label={['Luna', 'Sistema', 'Casa agora'][i]}>
            {sl}
          </section>
        ))}
      </div>
      <div className="m-dots" role="tablist">
        {slides.map((_, i) => (
          <button key={i} role="tab" aria-selected={i === slide} aria-label={['Luna', 'Sistema', 'Casa agora'][i]} className={i === slide ? 'on' : ''} onClick={() => goTo(i)}>
            <i />
          </button>
        ))}
      </div>
    </div>
  );

  const quick = (
    <div className="m-scroll -mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-1">
      {lights.length > 0 && (
        <>
          <button className="m-chip" onClick={() => void allLights(false)}>
            <Moon className="h-4 w-4" /> Apagar tudo
          </button>
          <button className="m-chip" onClick={() => void allLights(true)}>
            <Sun className="h-4 w-4" /> Acender tudo
          </button>
        </>
      )}
      {!!p.cameras?.length && (
        <button className="m-chip" onClick={() => openCameras(p.cameras!.map((c) => c.entityId))}>
          <Cctv className="h-4 w-4" /> Câmeras
        </button>
      )}
      <button className="m-chip" onClick={() => navigate('/clima')}>
        <CloudSun className="h-4 w-4" /> Previsão
      </button>
    </div>
  );

  const weatherCard = (
    <button className="m-card text-left" onClick={() => navigate('/clima')}>
      <div className="flex justify-between gap-3">
        <div>
          <p className="m-label">Clima agora</p>
          <p className="m-num mt-1.5 text-[44px] leading-none font-medium">{p.weather ? `${round(p.weather.current.temperature)}°` : '—'}</p>
          <p className="m-muted mt-1.5 text-sm">{p.weather ? `${p.weather.current.condition} · sensação ${round(p.weather.current.apparentTemperature)}°` : 'Defina a localização em Ajustes'}</p>
        </div>
        {p.weather && <WeatherIcon code={p.weather.current.weatherCode} isDay={p.weather.current.isDay} className="h-14 w-14" />}
      </div>
      {p.weather && (
        <div className="m-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          <span>💧 {p.weather.current.humidity}%</span>
          <span>{rain ? `🌧 ${rain.precipitationProbability}% às ${Number(rain.time.slice(11, 13))}h` : '☀️ sem chuva próxima'}</span>
          <span>💨 {round(p.weather.current.windSpeed)} km/h</span>
        </div>
      )}
    </button>
  );

  const cam = p.cameras?.[0];
  const cameraCard = cam && (
    <button className="m-card w-full text-left" style={{ padding: 8 }} onClick={() => openCameras(p.cameras!.map((c) => c.entityId))}>
      <div className="relative overflow-hidden" style={{ borderRadius: 'calc(var(--card-r) - 6px)' }}>
        <CameraThumb camera={cam} everyMs={6000} className="aspect-video w-full" />
        <span className="m-live">● {p.cameras!.length > 1 ? `${p.cameras!.length} câmeras` : 'câmera'}</span>
        <span className="absolute bottom-2.5 left-3 font-semibold [text-shadow:0_1px_6px_#000]">{cam.name}</span>
      </div>
    </button>
  );

  const devices = (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[17px] font-semibold">Aparelhos</p>
        <button onClick={() => navigate('/casa')} className="m-muted flex shrink-0 items-center text-sm">
          {onCount} de {toggles.length} ligados <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="m-scroll -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
        {FILTERS.map((f) => (
          <button key={f.id} className={`m-chip ${filter === f.id ? 'act' : ''}`} style={{ padding: '7px 13px', fontSize: 13 }} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className={`grid gap-3 ${p.wide ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {shown.map((d) => {
          const Icon = iconFor(d);
          return (
            <button key={d.entityId} className={`m-card m-tile ${d.available ? '' : 'opacity-50'}`} onClick={() => void useDevices.getState().toggle(d)} disabled={!d.available || busy[d.entityId]}>
              <div className="flex items-center justify-between">
                <span className={`m-iconbox ${d.isOn ? 'on' : ''}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className={`m-switch ${d.isOn ? 'on' : ''}`} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{d.name}</p>
                <p className="m-muted text-[12.5px]">{!d.available ? 'Indisponível' : d.isOn ? `Ligada${d.supportsBrightness && d.brightness !== null ? ` · ${d.brightness}%` : ''}` : 'Desligada'}</p>
              </div>
              {d.isOn && d.supportsBrightness && d.brightness !== null && (
                <div className="m-bar">
                  <i style={{ width: `${d.brightness}%` }} />
                </div>
              )}
            </button>
          );
        })}
        {!shown.length && <p className="m-muted col-span-full py-6 text-center text-sm">Nenhum aparelho aqui.</p>}
      </div>
    </div>
  );

  const header = (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="m-muted text-[15px]">
          {p.greeting}
          {p.userName ? `, ${p.userName}` : ''} 👋
        </p>
        <p className="m-num mt-0.5 leading-none font-medium" style={{ fontSize: p.wide ? 50 : 38 }}>
          {p.now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <p className="m-muted hidden text-sm first-letter:uppercase md:block">{p.now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        <button onClick={() => navigate('/configuracoes')} className="grid h-11 w-11 place-items-center rounded-full font-semibold text-[#06070d]" style={{ background: 'linear-gradient(135deg,var(--accent-1),var(--accent-2))' }} aria-label="Ajustes">
          {(p.userName || 'L').slice(0, 1).toUpperCase()}
        </button>
      </div>
    </div>
  );

  if (land) {
    // Hora e saudação numa linha (economiza altura)
    const compactHeader = (
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-muted min-w-0 truncate text-sm">
          {p.greeting}
          {p.userName ? `, ${p.userName}` : ''}
        </p>
        <p className="m-num shrink-0 text-2xl leading-none font-medium">{p.now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    );
    return (
      <div className="grid h-full min-h-0 gap-3 px-3 pt-2 pb-2" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', paddingRight: 'max(env(safe-area-inset-right), 12px)' }}>
        <div className="m-scroll flex min-h-0 flex-col gap-2.5 overflow-y-auto pb-1 [&>*]:shrink-0">
          {compactHeader}
          {hero}
        </div>
        <div className="m-scroll flex min-h-0 flex-col gap-3 overflow-y-auto pb-1 [&>*]:shrink-0">
          {quick}
          <GarageCard />
          <VacuumCard />
          <LitterCard />
          {devices}
          {weatherCard}
          {cameraCard}
        </div>
      </div>
    );
  }
  if (p.wide) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-5 px-8 pt-6 pb-3">
        {header}
        <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1.7fr)' }}>
          <div className="m-scroll flex min-h-0 flex-col gap-4 overflow-y-auto pb-2 [&>*]:shrink-0">
            {hero}
            {quick}
            {cameraCard}
          </div>
          <div className="m-scroll flex min-h-0 flex-col gap-4 overflow-y-auto pb-2 [&>*]:shrink-0">
            {weatherCard}
            <GarageCard />
          <VacuumCard />
          <LitterCard />
            {devices}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="m-scroll flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-safe pb-4 [&>*]:shrink-0">
      <div className="pt-2">{header}</div>
      {hero}
      {!p.hasChat && (
        <>
          {quick}
          <GarageCard />
          <VacuumCard />
          <LitterCard />
          {devices}
          {weatherCard}
          {cameraCard}
        </>
      )}
    </div>
  );
}

/** Medidor redondo (CPU, memória, temperatura). */
function Ring({ label, value, text, warm }: { label: string; value: number | null; text: string; warm?: boolean }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const id = `ring-${label}`;
  return (
    <div className="text-center">
      <svg width="80" height="80" viewBox="0 0 80 80" aria-label={`${label}: ${text}`}>
        <defs>
          <linearGradient id={id} x1="0" x2="1">
            <stop offset="0" stopColor={warm ? '#fbbf24' : 'var(--accent-1)'} />
            <stop offset="1" stopColor={warm ? '#fb7185' : 'var(--accent-2)'} />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
        {value != null && (
          <circle cx="40" cy="40" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(c * Math.max(2, value)) / 100} ${c}`} transform="rotate(-90 40 40)" style={{ transition: 'stroke-dasharray 600ms ease' }} />
        )}
        <text x="40" y="46" textAnchor="middle" className="m-num" fontSize="16" fill="currentColor">
          {text}
        </text>
      </svg>
      <p className="m-muted mt-0.5 text-[12.5px]">{label}</p>
    </div>
  );
}
