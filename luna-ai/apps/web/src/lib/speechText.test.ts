import { describe, expect, it } from 'vitest';
import { takeSentences, toSpeech } from './speechText';

describe('texto para fala', () => {
  it.each([
    ['Agora faz 26° com sensação de 28°C.', 'Agora faz 26 graus com sensação de 28 graus.'],
    ['Chance de chuva: 70%.', 'Chance de chuva: 70 por cento.'],
    ['A chuva começa às 19:00 e para às 21:30.', 'A chuva começa às 19 horas e para às 21 horas e 30.'],
    ['Vento de 12 km/h.', 'Vento de 12 quilômetros por hora.'],
    ['Temperatura: 24,6 graus', 'Temperatura: 24 vírgula 6 graus'],
    ['**Pronto!** A luz está acesa ✨', 'Pronto! A luz está acesa'],
    ['Primeiro item\nSegundo item', 'Primeiro item. Segundo item'],
  ])('%s', (input, expected) => expect(toSpeech(input)).toBe(expected));
});

describe('frases durante o streaming', () => {
  it('libera frases completas e guarda o resto', () => {
    const { ready, rest } = takeSentences('Claro! Hoje o dia está lindo lá fora. Quer que eu');
    expect(ready).toEqual(['Claro! Hoje o dia está lindo lá fora.']);
    expect(rest).toBe('Quer que eu');
  });
  it('não corta números decimais nem pontuação final ainda em aberto', () => {
    expect(takeSentences('A temperatura é 24.').ready).toEqual([]);
    expect(takeSentences('A temperatura é 24.5 graus agora mesmo. E').ready).toEqual(['A temperatura é 24.5 graus agora mesmo.']);
  });
});
