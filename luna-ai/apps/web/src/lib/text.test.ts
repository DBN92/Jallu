import { describe, expect, it } from 'vitest';
import { greeting, isWakeCall, normalize } from './text';

describe('utilitários de texto', () => {
  it('saudação conforme o horário', () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Bom dia');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Boa noite');
  });
  it('normaliza acentos para detectar “Ei, Luna”', () => {
    expect(normalize('Ei, LÚNA! Acenda a luz')).toBe('ei luna acenda a luz');
  });
});

describe('chamado “Ei, Luna”', () => {
  it.each(['Ei, Luna, acende a luz', 'luna que horas são', 'Oi Luana, vai chover?', 'LUNA!'])('reconhece: %s', (t) => expect(isWakeCall(t)).toBe(true));
  it.each(['vamos jantar às oito', 'a lua está bonita hoje', 'lunático'])('ignora: %s', (t) => expect(isWakeCall(t)).toBe(false));
});
