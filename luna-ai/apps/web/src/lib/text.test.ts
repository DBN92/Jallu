import { describe, expect, it } from 'vitest';
import { greeting, isWakeCall, normalize, splitWake } from './text';

describe('utilitários de texto', () => {
  it('saudação conforme o horário', () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Bom dia');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Boa noite');
  });
  it('normaliza acentos para detectar “Luna”', () => {
    expect(normalize('Ei, LÚNA! Acenda a luz')).toBe('ei luna acenda a luz');
  });
});

describe('chamado “Luna”', () => {
  it.each(['Luna', 'Luna, acende a luz', 'luna que horas são', 'Luna? vai chover?', 'oi Luna', 'OI LUNA!', 'Lúna, aspira a casa'])('reconhece: %s', (t) => expect(isWakeCall(t)).toBe(true));
  it.each(['acende a luz', 'a lua está linda', 'pergunta pra luna', 'bom dia, tudo bem?', 'oi dia', 'uma luz acesa', 'Luana chegou'])('ignora: %s', (t) => expect(isWakeCall(t)).toBe(false));
});

describe('pedido junto com o chamado', () => {
  it('separa o comando de “Luna”', () => {
    expect(splitWake('Luna, acende a luz da sala')).toBe('acende a luz da sala');
    expect(splitWake('Luna')).toBe('');
    expect(splitWake('acende a luz')).toBeNull();
  });
});

describe('“Luna” falado baixo (vários palpites)', () => {
  it('acha o chamado em qualquer palpite e em variações curtas', async () => {
    const { matchWake } = await import('./text');
    expect(matchWake(['lua acende a luz', 'luna acende a luz'])).toBe('acende a luz');
    expect(matchWake(['Lua.'])).toBe('');
    expect(matchWake(['luma'])).toBe('');
    expect(matchWake(['lona'])).toBe('');
  });
  it('não acorda em frases do dia a dia', async () => {
    const { matchWake } = await import('./text');
    for (const t of ['a lua está linda', 'acende a luz', 'lua cheia hoje', 'uma', 'luz', 'falei com a Luana', 'bom dia'])
      expect(matchWake([t]), t).toBeNull();
  });
});
