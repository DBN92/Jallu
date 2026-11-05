import { describe, expect, it } from 'vitest';
import { GestureStabilizer, mapCategory, SENSITIVITY } from './stabilizer';
import type { GestureName } from '@luna/shared/types';

/** Simula quadros a cada `step` ms; retorna os instantes em que disparou. */
function run(s: GestureStabilizer, frames: (GestureName | null)[], step = 250, score = 0.9, t0 = 0) {
  const fired: [number, GestureName][] = [];
  frames.forEach((g, i) => {
    const t = t0 + i * step;
    const r = s.push(g, score, t);
    if (r) fired.push([t, r]);
  });
  return fired;
}

describe('gestos: estabilizador (janela com tolerância)', () => {
  it('dispara com o gesto mantido ~0,8 s e não repete com a mão parada', () => {
    const s = new GestureStabilizer(SENSITIVITY.normal);
    const fired = run(s, Array(30).fill('open_palm'));
    expect(fired).toEqual([[1000, 'open_palm']]);
  });

  it('um quadro perdido no meio não cancela o gesto', () => {
    const s = new GestureStabilizer(SENSITIVITY.normal);
    const fired = run(s, ['open_palm', 'open_palm', null, 'open_palm', 'open_palm', 'open_palm']);
    expect(fired.length).toBe(1);
  });

  it('mão passando ou baixa certeza não dispara', () => {
    const s = new GestureStabilizer(SENSITIVITY.normal);
    expect(run(s, ['open_palm', null, null, null, 'open_palm', null, null])).toEqual([]);
    expect(run(new GestureStabilizer(SENSITIVITY.normal), Array(10).fill('closed_fist'), 250, 0.4)).toEqual([]);
  });

  it('precisa soltar a mão para repetir; outro gesto respeita o intervalo', () => {
    const s = new GestureStabilizer(SENSITIVITY.normal);
    const frames: (GestureName | null)[] = [...Array(8).fill('open_palm'), ...Array(6).fill(null), ...Array(30).fill('closed_fist')];
    const fired = run(s, frames);
    expect(fired[0]).toEqual([1000, 'open_palm']);
    // punho mantido: só dispara após o intervalo de 4 s desde o primeiro disparo
    expect(fired[1]![1]).toBe('closed_fist');
    expect(fired[1]![0]).toBeGreaterThanOrEqual(5000);
    expect(fired).toHaveLength(2);
  });

  it('sensibilidade alta aciona com menos quadros e menos certeza', () => {
    expect(run(new GestureStabilizer(SENSITIVITY.alta), Array(4).fill('victory'), 250, 0.5).length).toBe(1);
    expect(run(new GestureStabilizer(SENSITIVITY.precisa), Array(4).fill('victory'), 250, 0.5).length).toBe(0);
  });

  it('traduz as categorias do reconhecedor', () => {
    expect(mapCategory('Open_Palm')).toBe('open_palm');
    expect(mapCategory('ILoveYou')).toBe('i_love_you');
    expect(mapCategory('None')).toBeNull();
  });
});
