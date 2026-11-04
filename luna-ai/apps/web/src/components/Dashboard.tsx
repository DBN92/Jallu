import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, Droplets, Lightbulb, Plug, Power, Thermometer, ToggleLeft, Umbrella, Wind } from 'lucide-react';
import type { DeviceCategory, DeviceDto, HealthDto, WeatherDto } from '@luna/shared/types';
import { api } from '../services/api';
import { useAssistant } from '../stores/assistant';
import { useDevices } from '../stores/devices';
import { useSettings } from '../stores/settings';
import { WeatherIcon } from './WeatherIcon';
import { Spinner } from './ui';

export function Panel({ title, code, action, children, className = '' }: { title: string; code?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`hud-panel flex flex-col p-4 ${className}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <p className="hud-label">
          {code && <span className="mr-2 text-cyan-300/40">{code}</span>}
          {title}
        </p>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ClockPanel({ now, name, greeting }: { now: Date; name?: string; greeting: string }) {
  const hh = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <Panel title="Horário local" code="T-01">
      <p className="hud-title hud-glow text-5xl leading-none font-bold text-cyan-50 tabular-nums">{hh}</p>
      <p className="font-hud mt-2 text-sm font-semibold tracking-[0.18em] text-cyan-100/60 uppercase">
        {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
      </p>
      <div className="hud-divider my-3" />
      <p className="font-hud text-base text-cyan-50/80">
        {greeting}, <span className="font-bold text-cyan-300">{name}</span>.
      </p>
    </Panel>
  );
}

export function WeatherPanel({ data, loading, error }: { data: WeatherDto | null; loading: boolean; error: string | null }) {
  return (
    <Panel title="Atmosfera" code="W-02" action={<Link to="/clima" className="hud-label text-[9px] text-cyan-300/60 hover:text-cyan-200">detalhes ›</Link>}>
      {!data ? (
        <p className="font-hud text-sm text-cyan-100/50">{loading ? 'Sincronizando…' : (error ?? 'Defina a localização em Ajustes.')}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <WeatherIcon code={data.current.weatherCode} isDay={data.current.isDay} className="h-12 w-12 drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]" />
            <div>
              <p className="hud-title text-4xl font-bold text-cyan-50 tabular-nums">{Math.round(data.current.temperature)}°</p>
              <p className="font-hud text-sm text-cyan-100/70">{data.current.condition}</p>
            </div>
          </div>
          <div className="font-hud mt-3 grid grid-cols-3 gap-2 text-xs text-cyan-100/70">
            <span className="flex items-center gap-1"><Thermometer className="h-3.5 w-3.5 text-cyan-300" />{Math.round(data.current.apparentTemperature)}°</span>
            <span className="flex items-center gap-1"><Droplets className="h-3.5 w-3.5 text-cyan-300" />{data.current.humidity}%</span>
            <span className="flex items-center gap-1"><Umbrella className="h-3.5 w-3.5 text-cyan-300" />{data.daily[0]?.precipitationProbability ?? 0}%</span>
          </div>
          {/* Mini gráfico das próximas horas */}
          <div className="mt-3 flex h-14 items-end gap-1">
            {data.hourly.slice(0, 12).map((h) => (
              <div key={h.time} className="flex h-full flex-1 flex-col items-center gap-0.5" title={`${h.time.slice(11, 16)} · ${Math.round(h.temperature)}° · chuva ${h.precipitationProbability}%`}>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full ${h.precipitationProbability >= 40 ? 'bg-sky-400/70 shadow-[0_0_6px_rgba(56,189,248,0.6)]' : 'bg-cyan-300/30'}`}
                    style={{ height: `${Math.max(8, h.precipitationProbability)}%` }}
                  />
                </div>
                <span className="font-hud text-[8px] text-cyan-100/35">{h.time.slice(11, 13)}</span>
              </div>
            ))}
          </div>
          <p className="hud-label mt-1 text-[8px] text-cyan-300/40">chance de chuva · 12 h</p>
        </>
      )}
    </Panel>
  );
}

const ICONS: Record<DeviceCategory, typeof Lightbulb> = { lighting: Lightbulb, switches: ToggleLeft, outlets: Plug, sensors: Thermometer, climate: Wind, other: Box };

export function DevicesPanel({ className = '' }: { className?: string }) {
  const { devices, toggle, busy } = useDevices();
  const list = useMemo(
    () =>
      Object.values(devices)
        .filter((d) => d.controllable && !d.hidden)
        .sort((a, b) => Number(b.isOn) - Number(a.isOn) || Number(b.category === 'lighting') - Number(a.category === 'lighting') || a.name.localeCompare(b.name, 'pt-BR'))
        .slice(0, 10),
    [devices],
  );
  const on = Object.values(devices).filter((d) => d.controllable && d.isOn).length;
  const total = Object.values(devices).filter((d) => d.controllable).length;
  return (
    <Panel
      title="Controle da casa"
      code="H-03"
      className={className}
      action={
        <span className="font-hud text-xs font-bold text-cyan-300 tabular-nums">
          {on}/{total} <span className="text-cyan-100/40">ativos</span>
        </span>
      }
    >
      {list.length === 0 ? (
        <p className="font-hud text-sm text-cyan-100/50">Nenhum dispositivo controlável.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {list.map((d) => (
            <DeviceTile key={d.entityId} d={d} busy={!!busy[d.entityId]} onToggle={() => void toggle(d)} />
          ))}
        </div>
      )}
      <Link to="/casa" className="hud-label mt-3 self-end text-[9px] text-cyan-300/60 hover:text-cyan-200">todos os dispositivos ›</Link>
    </Panel>
  );
}

function DeviceTile({ d, busy, onToggle }: { d: DeviceDto; busy: boolean; onToggle: () => void }) {
  const Icon = ICONS[d.category];
  const on = d.isOn === true;
  return (
    <button
      onClick={onToggle}
      disabled={!d.available || busy}
      aria-label={`${on ? 'Desligar' : 'Ligar'} ${d.name}`}
      className={`group relative flex min-h-[64px] flex-col justify-between rounded-sm border p-2.5 text-left transition active:scale-[0.97] disabled:opacity-40 ${
        on ? 'border-amber-300/60 bg-amber-400/10 shadow-[0_0_14px_rgba(255,181,71,0.25)]' : 'border-cyan-300/15 bg-ink-900/60 hover:border-cyan-300/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${on ? 'text-amber-300 drop-shadow-[0_0_6px_#ffb547]' : 'text-cyan-300/50'}`} />
        {busy ? <Spinner className="h-3.5 w-3.5 text-cyan-300" /> : <Power className={`h-3.5 w-3.5 ${on ? 'text-amber-200' : 'text-cyan-100/30'}`} />}
      </div>
      <div>
        <p className="font-hud truncate text-sm leading-tight font-semibold text-cyan-50">{d.name}</p>
        <p className={`font-hud text-[10px] tracking-[0.18em] uppercase ${on ? 'text-amber-200/80' : 'text-cyan-100/35'}`}>
          {!d.available ? 'offline' : on ? (d.supportsBrightness && d.brightness ? `on · ${d.brightness}%` : 'on') : 'off'}
        </p>
      </div>
    </button>
  );
}

export function SensorsPanel() {
  const devices = useDevices((s) => s.devices);
  const sensors = Object.values(devices)
    .filter((d) => d.category === 'sensors' && !d.hidden && d.available)
    .sort((a, b) => Number(!!b.unit) - Number(!!a.unit) || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 6);
  if (!sensors.length) return null;
  return (
    <Panel title="Sensores" code="S-04">
      <ul className="space-y-2">
        {sensors.map((s) => (
          <li key={s.entityId} className="flex items-baseline justify-between gap-2 border-b border-cyan-300/10 pb-1.5 last:border-0">
            <span className="font-hud truncate text-sm text-cyan-100/70">{s.name}</span>
            <span className="hud-title text-sm font-bold text-cyan-50 tabular-nums">
              {s.domain === 'binary_sensor' ? (s.state === 'on' ? 'ATIVO' : 'OK') : s.state}
              {s.unit && <span className="ml-0.5 text-xs text-cyan-300/70">{s.unit}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Status({ label, ok, value }: { label: string; ok: boolean | null; value: string }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1">
      <span className="font-hud text-xs tracking-[0.14em] text-cyan-100/60 uppercase">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-hud text-xs font-semibold text-cyan-50/80">{value}</span>
        <span className={`h-2 w-2 rounded-full ${ok === null ? 'bg-cyan-100/30' : ok ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
      </span>
    </li>
  );
}

export function SystemPanel() {
  const server = useAssistant((s) => s.serverConnected);
  const ha = useDevices((s) => s.haConnected);
  const settings = useSettings((s) => s.settings);
  const voiceMode = useSettings((s) => s.voiceMode);
  const [health, setHealth] = useState<HealthDto | null>(null);
  useEffect(() => {
    const load = () => api<HealthDto>('/api/health/details').then(setHealth).catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  const mode = settings?.aiMode === 'local' ? 'Local' : settings?.aiMode === 'cloud' ? 'Nuvem' : 'Híbrido';
  return (
    <Panel title="Diagnóstico" code="D-05">
      <ul>
        <Status label="Servidor" ok={server} value={server ? 'online' : 'offline'} />
        <Status label="Home Assistant" ok={ha} value={ha ? 'tempo real' : ha === false ? 'offline' : '—'} />
        <Status label="IA local" ok={health ? health.services.ollama.ok : null} value={health?.services.ollama.model ?? '—'} />
        <Status label="IA nuvem" ok={health?.services.openai.configured ? health.services.openai.ok : null} value={health?.services.openai.configured ? 'OpenAI' : 'desligada'} />
        <Status label="Modo" ok={null} value={mode} />
        <Status label="Voz" ok={null} value={voiceMode === 'realtime' ? 'tempo real' : 'básica'} />
      </ul>
    </Panel>
  );
}
