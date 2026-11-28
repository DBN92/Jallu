import { useEffect, useRef, useState } from 'react';
import type { WeatherDto } from '@luna/shared/types';
import { useSettings } from '../stores/settings';
import { useDevices } from '../stores/devices';
import { useClock, useWeather } from '../hooks/useWeather';
import { skyFx, skyPhase, skyTip, skyUrl, skyWeather, skyWindy, type SkyFx, type SkyPhase, type SkyWx } from '../lib/sky';
import { useSkyPreview } from '../stores/skyPreview';
import { normalizeName } from '../lib/houseLinks';
import { api, errorMessage } from '../services/api';

const FADE_MS = 2500;
/** Tamanho das imagens geradas (scripts/sky/render.cjs) */
const IW = 1600;
const IH = 1000;
/** A serra começa nesta altura da imagem */
const HILLS_Y = 360;
/** Onde está o sol em cada fase (fração da imagem) */
const SUN: Partial<Record<SkyPhase, [number, number]>> = { manha: [0.73, 0.15], dia: [0.86, 0.08], tarde: [0.5, 0.75] };
const CLOUD_H: Record<SkyWx, number> = { limpo: 0.47, nublado: 0.62, chuva: 1 };

/** Mesma conta do object-fit: cover (imagem centralizada, cobrindo a tela) */
function useCover() {
  const get = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = Math.max(vw / IW, vh / IH);
    return { vw, vh, s, x0: (vw - IW * s) / 2, y0: (vh - IH * s) / 2 };
  };
  const [g, setG] = useState(get);
  useEffect(() => {
    const on = () => setG(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return g;
}

/**
 * Céu de fundo do tema “Céu”, em camadas: fundo (gradiente, sol, lua) → raios de sol girando devagar →
 * nuvens deslizando → serra na frente → chuva caindo. Só imagens prontas mexidas por transform/opacity
 * (a placa de vídeo faz o trabalho); com “menos animação” nos Ajustes, tudo fica parado.
 */
export function SkyBackdrop() {
  const on = useSettings((s) => s.theme) === 'ceu';
  if (!on) return null;
  return <Sky />;
}

interface Scene {
  key: string;
  /** Nome das imagens (fase-tempo) */
  asset: string;
  phase: SkyPhase;
  wx: SkyWx;
  fx: SkyFx;
  windy: boolean;
}

/** Tempo de verdade, ou o da prévia escolhida nos Ajustes */
function useSkyState() {
  const now = useClock();
  const { data: weather, reload } = useWeather('home');
  const preview = useSkyPreview((s) => s.preview);
  // O tempo muda ao longo do dia: atualiza a cada 30 min
  useEffect(() => {
    const t = setInterval(() => void reload(), 30 * 60_000);
    return () => clearInterval(t);
  }, [reload]);
  if (!preview) return { now, weather };
  const at = new Date(now);
  if (preview.hour !== undefined) at.setHours(preview.hour, 0, 0, 0);
  const base = weather ?? ({ hourly: [], daily: [], current: {} } as unknown as WeatherDto);
  return { now: at, weather: { ...base, current: { ...base.current, weatherCode: preview.code, windSpeed: preview.wind ?? 5 } } as WeatherDto };
}

function Sky() {
  const { now, weather } = useSkyState();
  const phase = skyPhase(now, weather);
  const wx = skyWeather(weather);
  const fx = skyFx(weather);
  const windy = skyWindy(weather);
  const asset = `${phase}-${wx}`;
  const key = `${asset}-${fx}-${windy ? 'vento' : ''}`;
  const [layers, setLayers] = useState<(Scene & { n: number; shown: boolean })[]>([{ key, asset, phase, wx, fx, windy, n: 0, shown: true }]);
  const n = useRef(0);
  const geo = useCover();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.sky = phase;
    root.dataset.skyFx = fx;
  }, [phase, fx]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.sky;
      delete document.documentElement.dataset.skyFx;
    },
    [],
  );

  // Troca de céu: carrega as camadas novas antes e faz o dissolve
  useEffect(() => {
    if (layers[layers.length - 1]?.key === key) return;
    let alive = true;
    const timers: number[] = [];
    const urls = [skyUrl(phase, wx), `/sky/${asset}-nuvens.webp`, `/sky/${asset}-serra.webp`];
    void Promise.all(urls.map((u) => new Promise((ok) => Object.assign(new Image(), { onload: ok, onerror: ok, src: u })))).then(() => {
      if (!alive) return;
      const k = ++n.current;
      setLayers((l) => [...l.slice(-1), { key, asset, phase, wx, fx, windy, n: k, shown: false }]);
      timers.push(window.setTimeout(() => setLayers((l) => l.map((x) => (x.n === k ? { ...x, shown: true } : x))), 50));
      timers.push(window.setTimeout(() => setLayers((l) => l.filter((x) => x.n === k)), FADE_MS + 300));
    });
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { s, x0, y0, vw } = geo;
  const box = (y: number, w: number, h: number) => ({ left: x0, top: y0 + y * s, width: w * s, height: h * s });
  return (
    <div className="sky-bg" aria-hidden="true">
      {layers.map((l) => {
        const sun = l.wx !== 'chuva' && l.fx === 'nenhum' ? SUN[l.phase] : undefined;
        const cloudW = IW * 2 * s;
        const night = l.phase === 'noite' ? 'dim' : '';
        return (
          <div key={l.n} className={`sky-scene ${l.shown ? 'in' : ''}`}>
            <img src={skyUrl(l.phase, l.wx)} alt="" decoding="async" style={box(0, IW, IH)} />
            {sun && <div className={`sky-rays ${l.wx === 'limpo' ? '' : 'faint'} ${l.phase}`} style={{ left: x0 + sun[0] * IW * s, top: y0 + sun[1] * IH * s }} />}
            <img
              className="sky-clouds"
              src={`/sky/${l.asset}-nuvens.webp`}
              alt=""
              decoding="async"
              style={{ ...box(0, IW * 2, IH * CLOUD_H[l.wx]), ['--travel' as string]: `${Math.min(0, vw - x0 - cloudW)}px`, animationDuration: l.windy ? '90s' : l.wx === 'chuva' ? '300s' : '420s' }}
            />
            {l.fx === 'tempestade' && <Lightning />}
            <img src={`/sky/${l.asset}-serra.webp`} alt="" decoding="async" style={box(HILLS_Y, IW, IH - HILLS_Y)} />
            {l.fx === 'neblina' && (
              <div className="sky-fog">
                <i className="a" />
                <i className="b" />
              </div>
            )}
            {(l.fx === 'chuva' || l.fx === 'tempestade' || l.fx === 'garoa') && (
              <div className={`sky-rain ${night} ${l.fx}`}>
                <i className="far" />
                {l.fx !== 'garoa' && <i className="near" />}
              </div>
            )}
            {l.fx === 'neve' && (
              <div className={`sky-snow ${night}`}>
                <i className="far" />
                <i className="near" />
              </div>
            )}
            {l.windy && <Wind leaves={l.fx === 'nenhum' || l.fx === 'neblina'} />}
          </div>
        );
      })}
      <div className="sky-scrim" />
      <div className="sky-flash" />
    </div>
  );
}

/** Raio: um risco que aparece junto com o clarão (ver .sky-flash), em pontos que mudam a cada ciclo */
function Lightning() {
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSpot((x) => (x + 1) % 3), 11_000);
    return () => clearInterval(t);
  }, []);
  const left = ['22%', '64%', '41%'][spot];
  return (
    <svg className="sky-bolt" style={{ left }} viewBox="0 0 120 400" preserveAspectRatio="none" aria-hidden="true">
      <path d="M70 0 L58 60 L72 92 L50 150 L64 178 L38 252 L52 280 L30 400" />
      <path d="M50 150 L28 196 L34 230" strokeWidth="2" />
      <path d="M64 178 L88 226 L82 262 L96 300" strokeWidth="1.6" />
    </svg>
  );
}

/** Vento: riscos passando e algumas folhas voando */
function Wind({ leaves }: { leaves: boolean }) {
  return (
    <div className="sky-wind">
      <i className="streak" />
      {leaves &&
        [0, 1, 2, 3, 4, 5].map((k) => (
          <svg key={k} className={`leaf l${k}`} viewBox="0 0 24 24">
            <path d="M3 21C3 10 10 3 21 3c0 11-7 18-18 18zm0 0L14 10" />
          </svg>
        ))}
    </div>
  );
}

/** Dica do momento na tela inicial (tema Céu): ex. “Escurecendo: acender a sala?” — tocar faz a ação. */
export function SkyTipChip({ now, weather }: { now: Date; weather: WeatherDto | null }) {
  const on = useSettings((s) => s.theme) === 'ceu';
  const devices = useDevices((s) => s.devices);
  const [msg, setMsg] = useState<string | null>(null);
  if (!on) return null;
  const lights = Object.values(devices).filter((d) => d.category === 'lighting' && d.controllable && !d.hidden && d.available);
  const sala = lights.filter((d) => normalizeName(d.name).includes('sala'));
  const tip = skyTip(now, weather, { lightsOn: lights.filter((d) => d.isOn).length, salaOff: sala.length > 0 && sala.every((d) => !d.isOn) });
  if (!tip && !msg) return null;
  const run = async () => {
    if (!tip?.action) return;
    try {
      if (tip.action === 'boa-noite') {
        await api('/api/tv/scene/boa-noite', { method: 'POST' });
        setMsg('Boa noite! Luzes apagadas.');
      } else {
        for (const d of sala) {
          if (d.supportsBrightness) await useDevices.getState().brightness(d.entityId, 70);
          else if (!d.isOn) await useDevices.getState().toggle(d);
        }
        setMsg('Sala acesa.');
      }
      void useDevices.getState().load(true);
    } catch (err) {
      setMsg(errorMessage(err));
    }
    window.setTimeout(() => setMsg(null), 4000);
  };
  return (
    <button className="m-chip sky-tip shrink-0" onClick={() => void run()} disabled={!tip?.action && !msg}>
      <i />
      {msg ?? tip!.text}
    </button>
  );
}
