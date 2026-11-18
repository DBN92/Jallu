import { useEffect, useRef, useState } from 'react';
import type { WeatherDto } from '@luna/shared/types';
import { useSettings } from '../stores/settings';
import { useDevices } from '../stores/devices';
import { useClock, useWeather } from '../hooks/useWeather';
import { skyPhase, skyTip, skyUrl, skyWeather } from '../lib/sky';
import { normalizeName } from '../lib/houseLinks';
import { api, errorMessage } from '../services/api';

const FADE_MS = 2500;

/**
 * Céu de fundo do tema “Céu”. Escolhe a imagem pela hora e pelo tempo e troca com dissolve.
 * Leve: é só uma imagem parada (no máximo duas durante a troca), sem nada desenhado ao vivo.
 */
export function SkyBackdrop() {
  const on = useSettings((s) => s.theme) === 'ceu';
  if (!on) return null;
  return <Sky />;
}

function Sky() {
  const now = useClock();
  const { data: weather, reload } = useWeather('home');
  // O tempo muda ao longo do dia: atualiza a cada 30 min
  useEffect(() => {
    const t = setInterval(() => void reload(), 30 * 60_000);
    return () => clearInterval(t);
  }, [reload]);
  const phase = skyPhase(now, weather);
  const url = skyUrl(phase, skyWeather(weather));
  const [layers, setLayers] = useState<{ url: string; n: number; shown: boolean }[]>([{ url, n: 0, shown: true }]);
  const n = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.sky = phase;
  }, [phase]);
  useEffect(() => () => void delete document.documentElement.dataset.sky, []);

  useEffect(() => {
    if (layers[layers.length - 1]?.url === url) return;
    let alive = true;
    const timers: number[] = [];
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const k = ++n.current;
      setLayers((l) => [...l.slice(-1), { url, n: k, shown: false }]);
      timers.push(window.setTimeout(() => setLayers((l) => l.map((x) => (x.n === k ? { ...x, shown: true } : x))), 50));
      timers.push(window.setTimeout(() => setLayers((l) => l.filter((x) => x.n === k)), FADE_MS + 300));
    };
    img.src = url;
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sky-bg" aria-hidden="true">
      {layers.map((l) => (
        <img key={l.n} src={l.url} alt="" className={l.shown ? 'in' : ''} decoding="async" />
      ))}
      <div className="sky-scrim" />
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
