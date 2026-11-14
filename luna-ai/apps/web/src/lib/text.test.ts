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

describe('chamado “Oi, Luna”', () => {
  it.each(['Oi, Luna', 'oi luna acende a luz', 'Olá Luna, vai chover?', 'OI LUNA!', 'ei luna que horas são', 'oiluna', 'tá bom, oi Luna, apaga a luz'])('reconhece: %s', (t) => expect(isWakeCall(t)).toBe(true));
  it.each(['Luna', 'Luna, acende a luz', 'acende a luz', 'a lua está linda', 'pergunta pra luna', 'oi, tudo bem?', 'oi lua', 'Luana chegou'])('ignora: %s', (t) => expect(isWakeCall(t)).toBe(false));
});

describe('pedido junto com o chamado', () => {
  it('separa o comando de “Oi, Luna”', () => {
    expect(splitWake('Oi, Luna, acende a luz da sala')).toBe('acende a luz da sala');
    expect(splitWake('oi luna')).toBe('');
    expect(splitWake('Luna, acende a luz')).toBeNull();
  });
});

describe('“Oi, Luna” falado baixo (vários palpites)', () => {
  it('acha o chamado em qualquer palpite e em variações curtas', async () => {
    const { matchWake } = await import('./text');
    expect(matchWake(['oi lua acende a luz', 'oi luna acende a luz'])).toBe('acende a luz');
    expect(matchWake(['Oi, lua.'])).toBe('');
    expect(matchWake(['boi luna'])).toBe('');
    expect(matchWake(['oi lona'])).toBe('');
  });
  it('não acorda em frases do dia a dia', async () => {
    const { matchWake } = await import('./text');
    for (const t of ['a lua está linda', 'acende a luz', 'luna', 'oi', 'oi, a lua está linda', 'falei com a Luana', 'bom dia'])
      expect(matchWake([t]), t).toBeNull();
  });
});

import { isThanks } from './text';
describe('agradecimento encerra a conversa', () => {
  it('reconhece agradecimentos e despedidas', () => {
    for (const t of ['Obrigado', 'obrigada, Luna!', 'valeu', 'muito obrigado mesmo', 'brigado, era só isso', 'tchau Luna', 'ok, obrigado pela ajuda']) expect(isThanks(t), t).toBe(true);
  });
  it('agradecimento com outro pedido não encerra', () => {
    for (const t of ['obrigado, agora apaga a luz', 'valeu, e amanhã vai chover?', 'acende a luz da sala', 'qual a temperatura']) expect(isThanks(t), t).toBe(false);
  });
});
