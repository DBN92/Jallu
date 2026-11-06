import { describe, expect, it } from 'vitest';
import { parseIntent, pickOption } from '../src/modules/ai/nlu';
import { classify, routeProviders } from '../src/modules/ai/router';
import type { AIProvider } from '../src/modules/ai/types';

describe('NLU local', () => {
  it.each([
    ['DIA, acenda a luz da sala.', { type: 'device_power', action: 'turn_on', target: 'a luz da sala', all: false }],
    ['ei luna desligue o ventilador por favor', { type: 'device_power', action: 'turn_off', target: 'o ventilador' }],
    ['Apague todas as luzes', { type: 'device_power', action: 'turn_off', all: true }],
    ['você pode ligar a tomada da cafeteira?', { type: 'device_power', action: 'turn_on', target: 'a tomada da cafeteira' }],
    ['coloque a luz da sala em 50%', { type: 'brightness', value: 50, target: 'a luz da sala' }],
    ['Quais luzes estão acesas?', { type: 'list_on', category: 'lighting' }],
    ['A luz da sala está acesa?', { type: 'device_query', target: 'luz da sala' }],
    ['Que horas são?', { type: 'datetime', what: 'time' }],
    ['Vai chover hoje?', { type: 'weather', period: 'today' }],
    ['Preciso levar guarda-chuva?', { type: 'weather', umbrella: true }],
    ['Como vai estar o tempo amanhã?', { type: 'weather', period: 'tomorrow' }],
    ['Lembre que eu prefiro luz quente à noite', { type: 'remember', content: 'eu prefiro luz quente à noite' }],
    ['Esqueça que eu prefiro luz quente', { type: 'forget', content: 'eu prefiro luz quente' }],
  ])('%s', (text, expected) => {
    expect(parseIntent(text)).toMatchObject(expected);
  });

  it('deixa conversas abertas para o LLM', () => {
    expect(parseIntent('Me ajude a organizar minha semana')).toBeNull();
    expect(parseIntent('Conte uma piada')).toBeNull();
    expect(parseIntent('Crie uma automação para ligar a luz da varanda ao anoitecer')).toBeNull();
    expect(parseIntent('desligue todas as luzes às 23h')).toBeNull();
    expect(parseIntent('quando eu sair de casa, desligue as luzes')).toBeNull();
  });

  it('interpreta a escolha em desambiguação', () => {
    const opts = [{ name: 'Luz do Quarto Casal' }, { name: 'Luz do Quarto Hóspedes' }];
    expect(pickOption('a do casal', opts)).toEqual([0]);
    expect(pickOption('a segunda', opts)).toEqual([1]);
    expect(pickOption('as duas, todas', opts)).toEqual([0, 1]);
    expect(pickOption('não sei', opts)).toBeNull();
  });
});

describe('roteador de IA', () => {
  const fake = (name: 'ollama' | 'openai') => ({ name }) as AIProvider;
  const providers = { ollama: fake('ollama'), openai: fake('openai') };

  it('classifica mensagens', () => {
    expect(classify('Quais luzes estão ligadas?')).toBe('home');
    expect(classify('Me ajude a organizar minha semana')).toBe('complex');
    expect(classify('Crie uma automação para desligar as luzes quando eu sair')).toBe('complex');
    expect(classify('Oi, tudo bem?')).toBe('simple');
  });

  it('respeita os modos local, nuvem e híbrido', () => {
    expect(routeProviders('organize minha semana', 'local', providers).map((p) => p.name)).toEqual(['ollama']);
    expect(routeProviders('oi', 'cloud', providers).map((p) => p.name)).toEqual(['openai', 'ollama']);
    expect(routeProviders('oi', 'hybrid', providers).map((p) => p.name)).toEqual(['ollama', 'openai']);
    expect(routeProviders('Me ajude a organizar minha semana', 'hybrid', providers).map((p) => p.name)).toEqual(['openai', 'ollama']);
  });
});

describe('chamado “Oi, Dia”', () => {
  it('tira o chamado do início, mas não mexe em “dia” comum', async () => {
    const { stripWake, parseIntent } = await import('../src/modules/ai/nlu');
    expect(stripWake('Oi, Dia, acende a luz da sala')).toBe('acende a luz da sala');
    expect(stripWake('Dia, que horas são?')).toBe('que horas são?');
    expect(stripWake('dia 15 é feriado?')).toBe('dia 15 é feriado?');
    expect(parseIntent('Oi Dia, que horas são?')).toMatchObject({ type: 'datetime' });
  });
});
