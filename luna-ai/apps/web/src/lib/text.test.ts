import { describe, expect, it } from 'vitest';
import { greeting, normalize } from './text';

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
