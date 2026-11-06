import { useMemo, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cctv, ChevronRight, CloudSun, Fan, Lightbulb, Moon, Plug, Plus, Power, SendHorizontal, Sparkles, Sun, Thermometer, Volume2, VolumeX } from 'lucide-react';
import type { AssistantState, CameraDto, DeviceDto, HealthDto, WeatherDto } from '@luna/shared/types';
import { useDevices } from '../stores/devices';
import { useCameras } from '../stores/cameras';
import type { UiMessage } from '../stores/assistant';
import { LunaOrb } from './LunaOrb';
import { MessageList } from './Messages';
import { CameraThumb } from './CameraPlayer';
import { WeatherIcon } from './WeatherIcon';

type Filter = 'all' | 'lighting' | 'outlets' | 'other';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'lighting', label: 'Luzes' },
  { id: 'outlets', label: 'Tomadas' },
  { id: 'other', label: 'Outros' },
];
const isToggle = (d: DeviceDto) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors';
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
  onNew: () => void;
  weather: WeatherDto | null;
  health: HealthDto | null;
  cameras: CameraDto[] | null;
  banner: ReactNode;
  wide: boolean;
  vw: number;
}

/** Tela inicial dos temas modernos: cartões arredondados, onda colorida e controles diretos. */
export function ModernHome(p: ModernHomeProps) {
  const navigate = useNavigate();
  const devicesMap = useDevices((s) => s.devices);
  const busy = useDevices((s) => s.busy);
  const openCameras = useCameras((s) => s.open);
  const [filter, setFilter] = useState<Filter>('all');

  const toggles = useMemo(
    () =>
      Object.values(devicesMap)
        .filter(isToggle)
        .sort((a, b) => Number(b.isOn) - Number(a.isOn) || a.name.localeCompare(b.name, 'pt-BR')),
    [devicesMap],
  );
  const shown = toggles.filter((d) => filter === 'all' || (filter === 'outlets' ? d.category === 'outlets' || d.category === 'switches' : filter === 'other' ? !['lighting', 'outlets', 'switches'].includes(d.category) : d.category === filter));
  const lights = toggles.filter((d) => d.category === 'lighting');
  const onCount = toggles.filter((d) => d.isOn).length;
  const rain = p.weather?.hourly.slice(0, 12).find((h) => h.precipitationProbability >= 40);

  const allLights = async (on: boolean) => {
    for (const d of lights.filter((l) => l.isOn === !on)) await useDevices.getState().toggle(d);
  };

  const waveW = p.wide ? Math.min(460, p.vw * 0.34) : Math.min(p.vw - 76, 460);

  const hero = (
    <div className="m-card" style={{ padding: p.wide ? 24 : 20 }}>
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
            <button onClick={p.onNew} className="m-iconbox" style={{ width: 36, height: 36, borderRadius: 12 }} aria-label="Nova conversa">
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="my-3 flex justify-center">
        <LunaOrb state={p.state} levelRef={p.levelRef} size={waveW} height={p.hasChat ? 70 : p.wide ? 150 : 110} onClick={p.onMic} />
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
            placeholder={p.micActive ? 'Ouvindo…' : 'Diga “Ei, Luna” ou digite…'}
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

  const sys = p.health?.system;
  const statusCard = (
    <div className="m-card">
      <p className="m-label">Sistema</p>
      <div className="mt-3 space-y-2.5 text-sm">
        {[
          ['Home Assistant', p.health?.services.homeAssistant.ok],
          ['IA local', p.health?.services.ollama.ok],
        ].map(([n, ok]) => (
          <div key={String(n)} className="flex items-center justify-between">
            <span>{n}</span>
            <span className={`flex items-center gap-2 ${ok ? 'text-emerald-300' : ok === false ? 'text-rose-300' : 'm-muted'}`}>
              <i className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : ok === false ? 'bg-rose-400' : 'bg-white/30'}`} />
              {ok ? 'online' : ok === false ? 'offline' : '…'}
            </span>
          </div>
        ))}
        {sys && (
          <>
            <div>
              <div className="m-muted mb-1 flex justify-between text-xs"><span>CPU</span><span>{sys.cpuPercent}%</span></div>
              <div className="m-bar"><i style={{ width: `${Math.max(3, sys.cpuPercent)}%`, background: 'linear-gradient(90deg,var(--accent-1),var(--accent-2))' }} /></div>
            </div>
            <div>
              <div className="m-muted mb-1 flex justify-between text-xs"><span>Memória</span><span>{sys.memoryPercent}%</span></div>
              <div className="m-bar"><i style={{ width: `${Math.max(3, sys.memoryPercent)}%`, background: 'linear-gradient(90deg,var(--accent-1),var(--accent-2))' }} /></div>
            </div>
          </>
        )}
      </div>
    </div>
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
            <div className="grid grid-cols-2 gap-4">
              {weatherCard}
              {statusCard}
            </div>
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
          {devices}
          {weatherCard}
          {cameraCard}
        </>
      )}
    </div>
  );
}
