import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Droplets, Lightbulb, Plug, Thermometer, ToggleLeft, Umbrella, Wind, Box, Disc3 } from 'lucide-react';
import type { DeviceCategory, WeatherDto } from '@luna/shared/types';
import { useDevices } from '../stores/devices';
import { AnimatedBackground } from './AnimatedBackground';
import { LunaOrb } from './LunaOrb';
import { WeatherIcon } from './WeatherIcon';

const SLIDE_MS = 10_000;
const ICONS: Record<DeviceCategory, typeof Lightbulb> = { lighting: Lightbulb, switches: ToggleLeft, outlets: Plug, sensors: Thermometer, climate: Wind, vacuum: Disc3, other: Box };

function WeatherSlide({ w }: { w: WeatherDto }) {
  const today = w.daily[0];
  return (
    <div>
      <p className="hud-label">Previsão do tempo{w.location.name ? ` · ${w.location.name}` : ''}</p>
      <div className="mt-4 flex items-center gap-5">
        <WeatherIcon code={w.current.weatherCode} isDay={w.current.isDay} className="h-20 w-20 drop-shadow-[0_0_14px_rgba(0,229,255,0.6)] md:h-28 md:w-28" />
        <div>
          <p className="hud-title hud-glow text-6xl font-bold text-cyan-50 tabular-nums md:text-8xl">{Math.round(w.current.temperature)}°</p>
          <p className="font-hud text-xl text-cyan-100/80 md:text-2xl">{w.current.condition}</p>
        </div>
      </div>
      <div className="font-hud mt-5 flex flex-wrap gap-x-6 gap-y-2 text-base text-cyan-100/75 md:text-lg">
        {today && (
          <span>
            ↓ {Math.round(today.min)}° · ↑ {Math.round(today.max)}°
          </span>
        )}
        <span className="flex items-center gap-1.5"><Thermometer className="h-4 w-4 text-cyan-300" /> sensação {Math.round(w.current.apparentTemperature)}°</span>
        <span className="flex items-center gap-1.5"><Droplets className="h-4 w-4 text-cyan-300" /> {w.current.humidity}%</span>
        <span className="flex items-center gap-1.5"><Umbrella className="h-4 w-4 text-cyan-300" /> chuva {today?.precipitationProbability ?? 0}%</span>
      </div>
      <div className="mt-6 grid grid-cols-6 gap-2">
        {w.hourly.slice(1, 7).map((h) => (
          <div key={h.time} className="flex flex-col items-center gap-1 rounded-sm border border-cyan-300/15 bg-ink-900/50 py-2">
            <span className="font-hud text-xs text-cyan-100/50">{h.time.slice(11, 16)}</span>
            <WeatherIcon code={h.weatherCode} className="h-5 w-5" />
            <span className="hud-title text-sm font-bold text-cyan-50">{Math.round(h.temperature)}°</span>
            <span className={`font-hud text-[10px] ${h.precipitationProbability >= 40 ? 'text-sky-300' : 'text-cyan-100/35'}`}>{h.precipitationProbability}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeSlide() {
  const devices = useDevices((s) => s.devices);
  const list = useMemo(() => Object.values(devices).filter((d) => !d.hidden), [devices]);
  const controls = list
    .filter((d) => d.controllable)
    .sort((a, b) => Number(b.isOn) - Number(a.isOn) || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 8);
  const sensors = list.filter((d) => d.category === 'sensors' && d.available && d.unit).slice(0, 3);
  const on = list.filter((d) => d.controllable && d.isOn).length;
  return (
    <div>
      <p className="hud-label">Controle da casa</p>
      <p className="hud-title hud-glow mt-3 text-4xl font-bold text-cyan-50 md:text-6xl">
        {on}
        <span className="text-xl text-cyan-100/50 md:text-2xl"> / {list.filter((d) => d.controllable).length} ligados</span>
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {controls.map((d) => {
          const Icon = ICONS[d.category];
          const isOn = d.isOn === true;
          return (
            <div
              key={d.entityId}
              className={`rounded-sm border p-3 ${isOn ? 'border-amber-300/60 bg-amber-400/10 shadow-[0_0_14px_rgba(255,181,71,0.25)]' : 'border-cyan-300/15 bg-ink-900/50'}`}
            >
              <Icon className={`h-5 w-5 ${isOn ? 'text-amber-300 drop-shadow-[0_0_6px_#ffb547]' : 'text-cyan-300/45'}`} />
              <p className="font-hud mt-2 truncate text-sm font-semibold text-cyan-50">{d.name}</p>
              <p className={`font-hud text-[10px] tracking-[0.2em] uppercase ${isOn ? 'text-amber-200/80' : 'text-cyan-100/35'}`}>
                {!d.available ? 'offline' : isOn ? (d.brightness ? `on · ${d.brightness}%` : 'on') : 'off'}
              </p>
            </div>
          );
        })}
      </div>
      {sensors.length > 0 && (
        <div className="font-hud mt-4 flex flex-wrap gap-x-6 gap-y-1 text-base text-cyan-100/75">
          {sensors.map((s) => (
            <span key={s.entityId}>
              {s.name}: <b className="hud-title text-cyan-50">{s.state}</b>
              <span className="text-cyan-300/70">{s.unit}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Modo ambiente: tela cheia exibida quando a Luna fica sem uso. Alterna automaticamente
 * entre previsão do tempo e controle da casa. Qualquer toque (ou “Oi, Luna”) volta ao normal.
 */
export function AmbientMode({ now, weather, onExit, hint }: { now: Date; weather: WeatherDto | null; onExit: () => void; hint: string }) {
  const slides = useMemo(() => [...(weather ? (['weather'] as const) : []), 'home' as const], [weather]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length]);
  const current = slides[index % slides.length];

  return createPortal(
    <div
      className="ambient-root overlay-full z-[65] overflow-hidden bg-ink-950"
      onPointerDown={(e) => {
        e.preventDefault();
        onExit();
      }}
      role="button"
      aria-label="Sair do modo ambiente"
    >
      <AnimatedBackground />
      <div className="relative z-10 flex h-full flex-col px-6 pt-safe pb-safe md:px-12">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 [@media(min-aspect-ratio:5/4)]:flex-row [@media(min-aspect-ratio:5/4)]:gap-12">
          {/* Relógio + avatar */}
          <div className="flex shrink-0 flex-col items-center text-center">
            <p className="hud-title hud-glow text-6xl font-bold text-cyan-50 tabular-nums md:text-8xl">
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="hud-label mt-2 text-xs md:text-sm">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
            <div className="mt-4">
              <LunaOrb state="idle" size={Math.min(240, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.38))} />
            </div>
          </div>

          {/* Painel que alterna */}
          <div className="hud-panel w-full max-w-2xl p-6 md:p-8">
            <div key={`${current}-${index}`} className="ambient-slide">
              {current === 'weather' && weather ? <WeatherSlide w={weather} /> : <HomeSlide />}
            </div>
            {slides.length > 1 && (
              <div className="mt-6 flex gap-2">
                {slides.map((s, i) => (
                  <div key={s} className="h-1 flex-1 overflow-hidden bg-cyan-300/15">
                    {i === index % slides.length && <div key={index} className="ambient-progress h-full bg-cyan-300 shadow-[0_0_8px_#00e5ff]" style={{ animationDuration: `${SLIDE_MS}ms` }} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="hud-label pb-3 text-center text-[10px] text-cyan-300/50">{hint}</p>
      </div>
    </div>,
    document.body,
  );
}
