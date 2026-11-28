import type { WeatherDto } from '@luna/shared';
import { AppError, ServiceUnavailableError } from '../../lib/errors';
import { describeWeather, isRainCode } from './wmo';

type FetchLike = typeof fetch;

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
    sunrise: string[];
    sunset: string[];
  };
}

export class WeatherService {
  private cache = new Map<string, { at: number; data: WeatherDto }>();

  constructor(
    private readonly opts: { forecastUrl: string; geocodingUrl: string; cacheMinutes: number },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /**
   * Coordenadas são arredondadas (~1 km) para a chave de cache e para a consulta,
   * reduzindo a precisão compartilhada. Nada é persistido em disco.
   */
  async forecast(latitude: number, longitude: number, name: string | null = null): Promise<WeatherDto> {
    const lat = Math.round(latitude * 100) / 100;
    const lon = Math.round(longitude * 100) / 100;
    const key = `${lat},${lon}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.opts.cacheMinutes * 60_000) {
      return { ...hit.data, location: { ...hit.data.location, name: name ?? hit.data.location.name }, cached: true };
    }

    const url = new URL(this.opts.forecastUrl);
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,precipitation_probability,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset',
      timezone: 'auto',
      forecast_days: '7',
      wind_speed_unit: 'kmh',
    }).toString();

    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      if (hit) return { ...hit.data, cached: true };
      throw new ServiceUnavailableError('weather', 'Não consegui consultar a previsão do tempo. Verifique a conexão com a internet.');
    }
    if (!res.ok) {
      if (hit) return { ...hit.data, cached: true };
      throw new AppError(502, `O serviço de clima retornou erro ${res.status}.`, 'weather_error');
    }
    const data = (await res.json()) as OpenMeteoResponse;

    const nowIdx = Math.max(0, data.hourly.time.findIndex((t) => t >= data.current.time.slice(0, 13)));
    const hourly = data.hourly.time.slice(nowIdx, nowIdx + 24).map((time, i) => {
      const j = nowIdx + i;
      return {
        time,
        temperature: data.hourly.temperature_2m[j]!,
        precipitationProbability: data.hourly.precipitation_probability[j] ?? 0,
        weatherCode: data.hourly.weather_code[j]!,
        condition: describeWeather(data.hourly.weather_code[j]!),
      };
    });
    const daily = data.daily.time.map((date, i) => ({
      date,
      min: data.daily.temperature_2m_min[i]!,
      max: data.daily.temperature_2m_max[i]!,
      precipitationProbability: data.daily.precipitation_probability_max[i] ?? 0,
      precipitationSum: data.daily.precipitation_sum[i] ?? 0,
      weatherCode: data.daily.weather_code[i]!,
      condition: describeWeather(data.daily.weather_code[i]!),
      sunrise: data.daily.sunrise[i]!,
      sunset: data.daily.sunset[i]!,
    }));

    const dto: WeatherDto = {
      location: { latitude: lat, longitude: lon, name, timezone: data.timezone },
      current: {
        time: data.current.time,
        temperature: data.current.temperature_2m,
        apparentTemperature: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        precipitation: data.current.precipitation,
        weatherCode: data.current.weather_code,
        condition: describeWeather(data.current.weather_code),
        windSpeed: data.current.wind_speed_10m,
        isDay: data.current.is_day === 1,
      },
      hourly,
      daily,
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
    this.cache.set(key, { at: Date.now(), data: dto });
    return dto;
  }

  async geocode(query: string) {
    const url = new URL(this.opts.geocodingUrl);
    url.search = new URLSearchParams({ name: query, count: '6', language: 'pt', format: 'json' }).toString();
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new ServiceUnavailableError('weather', 'Não consegui buscar cidades agora. Verifique a internet.');
    }
    if (!res.ok) throw new AppError(502, 'O serviço de busca de cidades falhou.', 'geocode_error');
    const data = (await res.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
    return (data.results ?? []).map((r) => ({
      name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  }

  /** Resumo em linguagem natural usado pela IA (sem coordenadas). */
  static summarize(w: WeatherDto, focus: 'now' | 'today' | 'tomorrow' | 'week' = 'today') {
    const today = w.daily[0];
    const tomorrow = w.daily[1];
    const nextHoursRain = w.hourly.slice(0, 12).reduce((m, h) => Math.max(m, h.precipitationProbability), 0);
    const rainSoon = w.hourly.slice(0, 12).some((h) => isRainCode(h.weatherCode) && h.precipitationProbability >= 40);
    return {
      local: w.location.name ?? 'localização informada',
      agora: {
        condicao: w.current.condition,
        temperatura_c: w.current.temperature,
        sensacao_c: w.current.apparentTemperature,
        umidade_pct: w.current.humidity,
        vento_kmh: w.current.windSpeed,
      },
      hoje: today && { condicao: today.condition, min_c: today.min, max_c: today.max, chance_chuva_pct: today.precipitationProbability, chuva_mm: today.precipitationSum },
      proximas_12h: { maior_chance_chuva_pct: nextHoursRain, chuva_provavel: rainSoon },
      amanha: focus === 'tomorrow' || focus === 'week' ? tomorrow && { condicao: tomorrow.condition, min_c: tomorrow.min, max_c: tomorrow.max, chance_chuva_pct: tomorrow.precipitationProbability } : undefined,
      semana: focus === 'week' ? w.daily.map((d) => ({ data: d.date, condicao: d.condition, min_c: d.min, max_c: d.max, chance_chuva_pct: d.precipitationProbability })) : undefined,
      recomendacao_guarda_chuva: rainSoon || (today?.precipitationProbability ?? 0) >= 50,
    };
  }
}
