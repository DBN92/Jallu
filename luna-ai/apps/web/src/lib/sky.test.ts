import { describe, expect, it } from 'vitest';
import type { WeatherDto } from '@luna/shared/types';
import { skyFx, skyPhase, skyTip, skyWeather, skyWindy } from './sky';

const wx = (code: number, rainAt: number[] = []): WeatherDto =>
  ({
    location: { latitude: 0, longitude: 0, name: null, timezone: 'America/Sao_Paulo' },
    current: { weatherCode: code, temperature: 22, apparentTemperature: 22, humidity: 60, windSpeed: 5, condition: '', isDay: true },
    hourly: Array.from({ length: 12 }, (_, i) => ({ time: `2026-11-18T${String(8 + i).padStart(2, '0')}:00`, temperature: 22, weatherCode: code, precipitationProbability: rainAt.includes(i) ? 70 : 0 })),
    daily: [{ date: '2026-11-18', min: 18, max: 28, precipitationProbability: 0, precipitationSum: 0, weatherCode: code, condition: '', sunrise: '2026-11-18T05:10', sunset: '2026-11-18T18:40' }],
  }) as unknown as WeatherDto;
const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m);

describe('tema Céu', () => {
  it('fase do dia segue o nascer e o pôr do sol', () => {
    const w = wx(0);
    expect(skyPhase(at(4, 0), w)).toBe('noite');
    expect(skyPhase(at(5, 0), w)).toBe('manha');
    expect(skyPhase(at(12), w)).toBe('dia');
    expect(skyPhase(at(18, 0), w)).toBe('tarde');
    expect(skyPhase(at(19, 30), w)).toBe('noite');
    expect(skyPhase(at(12), null)).toBe('dia');
  });
  it('tempo: limpo, nublado ou chuva pelo código WMO', () => {
    expect(skyWeather(wx(1))).toBe('limpo');
    expect(skyWeather(wx(3))).toBe('nublado');
    expect(skyWeather(wx(45))).toBe('nublado');
    expect(skyWeather(wx(63))).toBe('chuva');
    expect(skyWeather(wx(95))).toBe('chuva');
  });
  it('dicas do momento', () => {
    expect(skyTip(at(7), wx(0), { lightsOn: 0, salaOff: true })?.text).toMatch(/lavar roupa/);
    expect(skyTip(at(9), wx(0, [5]), { lightsOn: 0, salaOff: true })?.text).toMatch(/Chuva prevista às 13h/);
    expect(skyTip(at(18, 10), wx(0), { lightsOn: 0, salaOff: true })?.action).toBe('acender-sala');
    expect(skyTip(at(18, 10), wx(0), { lightsOn: 1, salaOff: false })).toBeNull();
    expect(skyTip(at(22), wx(0), { lightsOn: 3, salaOff: false })).toMatchObject({ action: 'boa-noite' });
    expect(skyTip(at(22), wx(0), { lightsOn: 0, salaOff: true })).toBeNull();
    expect(skyTip(at(14), wx(63), { lightsOn: 0, salaOff: true })?.text).toMatch(/janelas/);
  });
  it('efeitos: garoa, chuva, tempestade, neve, neblina e vento', () => {
    expect(skyFx(wx(0))).toBe('nenhum');
    expect(skyFx(wx(53))).toBe('garoa');
    expect(skyFx(wx(63))).toBe('chuva');
    expect(skyFx(wx(81))).toBe('chuva');
    expect(skyFx(wx(95))).toBe('tempestade');
    expect(skyFx(wx(73))).toBe('neve');
    expect(skyFx(wx(45))).toBe('neblina');
    expect(skyFx(null)).toBe('nenhum');
    expect(skyWindy(wx(0))).toBe(false);
    const w = wx(0);
    w.current.windSpeed = 32;
    expect(skyWindy(w)).toBe(true);
  });
});
