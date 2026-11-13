import { describe, expect, it } from 'vitest';
import { changedFraction } from './usePresence';

const frame = (fill: (i: number) => number) => {
  const a = new Uint8ClampedArray(32 * 24 * 4);
  for (let p = 0; p < 32 * 24; p++) {
    const v = fill(p);
    a.set([v, v, v, 255], p * 4);
  }
  return a;
};

describe('presença pela câmera', () => {
  it('ruído leve da câmera não conta; alguém entrando na imagem conta', () => {
    const base = frame(() => 120);
    expect(changedFraction(base, frame((p) => 120 + (p % 7) - 3))).toBe(0);
    // um vulto ocupando um quarto da imagem
    const person = frame((p) => (p % 32 < 16 && p < 32 * 12 ? 40 : 120));
    expect(changedFraction(base, person)).toBeCloseTo(0.25, 2);
  });

  it('na penumbra (tela apagada) ainda percebe alguém; mudança de exposição não conta', () => {
    const dark = frame(() => 18);
    const person = frame((p) => (p % 32 < 16 && p < 32 * 12 ? 6 : 18));
    expect(changedFraction(dark, person)).toBeGreaterThan(0.2);
    // a câmera clareou a imagem toda (exposição automática): não é movimento
    expect(changedFraction(dark, frame(() => 45))).toBe(0);
  });
});
