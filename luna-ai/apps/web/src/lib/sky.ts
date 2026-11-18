import type { WeatherDto } from '@luna/shared/types';

/**
 * Tema “Céu”: escolhe o céu de fundo pela hora (nascer e pôr do sol de verdade) e pelo tempo agora.
 * Os céus são imagens prontas em /sky (geradas por scripts/sky/render.cjs): o tablet só troca a imagem.
 */
export type SkyPhase = 'manha' | 'dia' | 'tarde' | 'noite';
export type SkyWx = 'limpo' | 'nublado' | 'chuva';

const MIN = 60_000;

/** "2026-11-18T05:12" (hora local da casa) → Date no dia de `now` */
function at(now: Date, hhmm: string | undefined, fallback: string) {
  const m = (hhmm ?? '').match(/T(\d{2}):(\d{2})/) ?? fallback.match(/(\d{2}):(\d{2})/)!;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export function skyPhase(now: Date, weather: WeatherDto | null): SkyPhase {
  const today = weather?.daily[0];
  const rise = at(now, today?.sunrise, '06:00').getTime();
  const set = at(now, today?.sunset, '18:30').getTime();
  const t = now.getTime();
  if (t < rise - 30 * MIN) return 'noite';
  if (t < rise + 180 * MIN) return 'manha';
  if (t < set - 75 * MIN) return 'dia';
  if (t < set + 35 * MIN) return 'tarde';
  return 'noite';
}

/** Código WMO do tempo agora → céu limpo, nublado ou chuva */
export function skyWeather(weather: WeatherDto | null): SkyWx {
  const c = weather?.current.weatherCode;
  if (c === undefined) return 'limpo';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'chuva';
  if (c >= 2) return 'nublado';
  return 'limpo';
}

/** Efeito animado por cima do céu, pelo código WMO do tempo agora */
export type SkyFx = 'nenhum' | 'garoa' | 'chuva' | 'tempestade' | 'neve' | 'neblina';
export function skyFx(weather: WeatherDto | null): SkyFx {
  const c = weather?.current.weatherCode;
  if (c === undefined) return 'nenhum';
  if (c >= 95) return 'tempestade';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'neve';
  if (c >= 51 && c <= 57) return 'garoa';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'chuva';
  if (c === 45 || c === 48) return 'neblina';
  return 'nenhum';
}

/** Ventando (rajada de folhas e nuvens mais rápidas) a partir de 25 km/h */
export const skyWindy = (weather: WeatherDto | null) => (weather?.current.windSpeed ?? 0) >= 25;

export const skyUrl = (p: SkyPhase, w: SkyWx) => `/sky/${p}-${w}.jpg`;

export type SkyTipAction = 'boa-noite' | 'acender-sala';
export interface SkyTip {
  text: string;
  action?: SkyTipAction;
}

/** Uma dica curta do momento (ou nada). */
export function skyTip(now: Date, weather: WeatherDto | null, info: { lightsOn: number; salaOff: boolean }): SkyTip | null {
  const phase = skyPhase(now, weather);
  const wx = skyWeather(weather);
  if (wx === 'chuva') return { text: 'Chovendo agora: as janelas estão fechadas?' };
  const next = weather?.hourly.slice(0, 8).find((h) => h.precipitationProbability >= 50);
  if ((phase === 'manha' || phase === 'dia') && next) return { text: `Chuva prevista às ${Number(next.time.slice(11, 13))}h: vale recolher a roupa do varal` };
  if (phase === 'manha' && weather && !weather.hourly.slice(0, 12).some((h) => h.precipitationProbability >= 40)) return { text: 'Dia bonito: bom para lavar roupa, sem chuva até a noite' };
  if (phase === 'tarde' && info.salaOff) return { text: 'Escurecendo: acender a sala?', action: 'acender-sala' };
  if (phase === 'noite' && now.getHours() >= 21 && info.lightsOn > 0) return { text: `${info.lightsOn === 1 ? '1 luz acesa' : `${info.lightsOn} luzes acesas`} · toque para “Boa noite”`, action: 'boa-noite' };
  return null;
}
