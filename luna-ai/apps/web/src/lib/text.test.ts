import { describe, expect, it } from 'vitest';
import { greeting, isWakeCall, normalize, splitWake } from './text';

describe('utilitários de texto', () => {
  it('saudação conforme o horário', () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Bom dia');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Boa noite');
  });
  it('normaliza acentos para detectar “Oi, Dia”', () => {
    expect(normalize('Ei, LÚNA! Acenda a luz')).toBe('ei luna acenda a luz');
  });
});

describe('chamado “Oi, Dia”', () => {
  it.each(['Oi, Dia, acende a luz', 'oi dia que horas são', 'Olá Dia, vai chover?', 'OI DIA!', 'oídia'])('reconhece: %s', (t) => expect(isWakeCall(t)).toBe(true));
  it.each(['vamos jantar às oito', 'bom dia, tudo bem?', 'que dia é hoje', 'dia 15 tem feriado', 'oi, tudo bem'])('ignora: %s', (t) => expect(isWakeCall(t)).toBe(false));
});

describe('pedido junto com o chamado', () => {
  it('separa o comando de “Oi, Dia”', () => {
    expect(splitWake('Oi, Dia, acende a luz da sala')).toBe('acende a luz da sala');
    expect(splitWake('oi dia')).toBe('');
    expect(splitWake('bom dia')).toBeNull();
  });
});

describe('“Oi, Dia” falado baixo (vários palpites)', () => {
  it('acha a frase em qualquer palpite e em variações curtas', async () => {
    const { matchWake } = await import('./text');
    expect(matchWake(['oi tia acende a luz', 'oi dia acende a luz'])).toBe('acende a luz');
    expect(matchWake(['boi dia'])).toBe('');
    expect(matchWake(['oi tia'])).toBe('');
    expect(matchWake(['Oi, Lia.'])).toBe('');
    expect(matchWake(['o dia'])).toBe('');
    expect(matchWake(['oi dia'])).toBe('');
  });
  it('não acorda em frases do dia a dia', async () => {
    const { matchWake } = await import('./text');
    for (const t of ['bom dia', 'o dia está lindo', 'que dia é hoje', 'oi tia tudo bem com você', 'dia', 'oi', 'falei com a tia ontem'])
      expect(matchWake([t]), t).toBeNull();
  });
});
