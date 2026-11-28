import type { DeviceDto, VacuumCommand, WeatherDto } from '@luna/shared';
import { normalize } from '../../lib/text';
import { isRainCode } from '../weather/wmo';

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const isLightNoun = (name: string) => /^(luz|lampada|luminaria|fita|abajur|spot|refletor)\b/.test(normalize(name));

/** Frases de confirmação em linguagem natural. */
export function powerReply(d: DeviceDto): string {
  if (d.domain === 'light' && isLightNoun(d.name)) {
    const article = normalize(d.name).startsWith('abajur') || normalize(d.name).startsWith('spot') || normalize(d.name).startsWith('refletor') ? 'O' : 'A';
    const adj = article === 'O' ? (d.isOn ? 'aceso' : 'apagado') : d.isOn ? 'acesa' : 'apagada';
    return `Pronto! ${article} ${lowerFirst(d.name)} está ${adj}.`;
  }
  if (d.domain === 'light') return d.isOn ? `Pronto! Acendi ${d.name}.` : `Pronto! Apaguei ${d.name}.`;
  return d.isOn ? `Pronto! Liguei ${d.name}.` : `Pronto! Desliguei ${d.name}.`;
}

export function stateReply(d: DeviceDto): string {
  if (!d.available) return `${d.name} está indisponível no momento.`;
  if (d.controllable) {
    if (d.domain === 'light') {
      const b = d.isOn && d.supportsBrightness && d.brightness !== null ? ` com ${d.brightness}% de brilho` : '';
      return `${d.name} está ${d.isOn ? 'acesa' : 'apagada'}${b}.`;
    }
    return `${d.name} está ${d.isOn ? 'ligado' : 'desligado'}.`;
  }
  if (d.domain === 'binary_sensor') return `${d.name}: ${d.isOn === null ? (d.state === 'on' ? 'ativo' : 'inativo') : d.state}.`;
  return `${d.name}: ${d.state}${d.unit ? ` ${d.unit}` : ''}.`;
}

/** Situação de um aspirador em uma frase: “Robô Xiaomi: aspirando, bateria em 64%.” */
export function vacuumStatus(d: DeviceDto): string {
  if (!d.available || !d.vacuum) return `${d.name} está indisponível no momento.`;
  const v = d.vacuum;
  const battery = v.battery !== null ? `, bateria em ${v.battery}%` : '';
  const error = v.error ? ` Aviso do robô: ${v.error}.` : '';
  return `${d.name}: ${lowerFirst(v.status)}${battery}.${error}`;
}

/** Confirmação depois de um comando ao aspirador (com o estado real lido depois). */
export function vacuumReply(command: VacuumCommand, d: DeviceDto, before?: DeviceDto): string {
  const phase = d.vacuum?.phase;
  switch (command) {
    case 'start':
      return phase === 'cleaning' ? `Pronto! ${d.name} começou a aspirar.` : `Mandei ${d.name} começar a limpeza; ele deve sair da base em instantes.`;
    case 'return_to_base':
      if (before?.vacuum?.phase === 'docked') return `${d.name} já está na base.`;
      return phase === 'docked' ? `${d.name} está na base.` : `${d.name} está voltando para a base.`;
    case 'pause':
      return `${d.name} pausou a limpeza. Diga “aspira a casa” para continuar.`;
    case 'stop':
      return `${d.name} parou.`;
    case 'locate':
      return `${d.name} vai apitar para você encontrá-lo.`;
    case 'set_fan_speed':
      return `${d.name} agora está na potência ${d.vacuum?.fanSpeed ?? ''}.`.replace(' .', '.');
  }
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

export function askWhich(options: DeviceDto[]): string {
  return `Encontrei mais de um dispositivo: ${listJoin(options.map((o) => o.name))}. Qual deles?`;
}

const r = (n: number) => Math.round(n);

export function weatherReply(w: WeatherDto, period: 'now' | 'today' | 'tomorrow' | 'week', umbrella: boolean): string {
  const today = w.daily[0];
  const tomorrow = w.daily[1];
  const rainSoon = w.hourly.slice(0, 12).filter((h) => h.precipitationProbability >= 40 && isRainCode(h.weatherCode));
  const maxProb = Math.max(0, ...w.hourly.slice(0, 12).map((h) => h.precipitationProbability));
  const where = w.location.name ? ` em ${w.location.name}` : '';

  if (umbrella) {
    if (rainSoon.length || (today?.precipitationProbability ?? 0) >= 50) {
      const first = rainSoon[0];
      const hour = first ? ` A chuva deve começar por volta das ${first.time.slice(11, 16)}.` : '';
      return `Sim, leve o guarda-chuva! A chance de chuva chega a ${Math.max(maxProb, today?.precipitationProbability ?? 0)}% hoje.${hour}`;
    }
    return `Acho que não vai precisar. A chance de chuva nas próximas horas é de no máximo ${maxProb}%.`;
  }
  if (period === 'tomorrow' && tomorrow) {
    return `Amanhã${where}: ${lowerFirst(tomorrow.condition)}, mínima de ${r(tomorrow.min)}° e máxima de ${r(tomorrow.max)}°, com ${tomorrow.precipitationProbability}% de chance de chuva.`;
  }
  if (period === 'week') {
    const rainy = w.daily.filter((d) => d.precipitationProbability >= 50).map((d) => new Date(`${d.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }));
    const temps = `As temperaturas variam entre ${r(Math.min(...w.daily.map((d) => d.min)))}° e ${r(Math.max(...w.daily.map((d) => d.max)))}°.`;
    return `${temps} ${rainy.length ? `Chuva provável na ${listJoin(rainy)}.` : 'Sem previsão de chuva significativa nos próximos dias.'}`;
  }
  const now = `Agora${where} faz ${r(w.current.temperature)}°, ${lowerFirst(w.current.condition)}, com sensação de ${r(w.current.apparentTemperature)}°.`;
  if (period === 'now' || !today) return now;
  const rain = today.precipitationProbability >= 50 ? ` Vai chover: ${today.precipitationProbability}% de chance.` : today.precipitationProbability >= 20 ? ` Pequena chance de chuva (${today.precipitationProbability}%).` : ' Sem chuva prevista.';
  return `${now} Hoje a máxima é de ${r(today.max)}° e a mínima de ${r(today.min)}°.${rain}`;
}

export { upperFirst };
