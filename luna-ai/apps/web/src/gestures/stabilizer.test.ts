import { describe, expect, it } from 'vitest';
import { GestureStabilizer, mapCategory } from './stabilizer';

describe('gestos: estabilizador', () => {
  it('só dispara com o gesto mantido ~1 s e não repete com a mão parada', () => {
    const s = new GestureStabilizer(900, 3, 4000);
    expect(s.push('open_palm', 0.9, 0)).toBeNull();
    expect(s.push('open_palm', 0.9, 330)).toBeNull();
    expect(s.push('open_palm', 0.9, 660)).toBeNull();
    expect(s.push('open_palm', 0.9, 990)).toBe('open_palm');
    expect(s.push('open_palm', 0.9, 1320)).toBeNull(); // mão continua aberta
    expect(s.push('open_palm', 0.9, 6000)).toBeNull(); // ainda o mesmo gesto contínuo
  });

  it('mão passando (um quadro só) ou com baixa confiança não dispara', () => {
    const s = new GestureStabilizer(900, 3, 4000);
    expect(s.push('open_palm', 0.9, 0)).toBeNull();
    expect(s.push(null, 0, 330)).toBeNull();
    expect(s.push('closed_fist', 0.4, 660)).toBeNull();
    expect(s.push('closed_fist', 0.4, 990)).toBeNull();
    expect(s.push('closed_fist', 0.4, 2000)).toBeNull();
  });

  it('respeita o intervalo entre gestos diferentes', () => {
    const s = new GestureStabilizer(900, 3, 4000);
    [0, 330, 660].forEach((t) => s.push('open_palm', 0.9, t));
    expect(s.push('open_palm', 0.9, 990)).toBe('open_palm');
    [1300, 1630, 1960].forEach((t) => s.push('closed_fist', 0.9, t));
    expect(s.push('closed_fist', 0.9, 2300)).toBeNull(); // dentro dos 4 s
    expect(s.push('closed_fist', 0.9, 5100)).toBe('closed_fist');
  });

  it('traduz as categorias do reconhecedor', () => {
    expect(mapCategory('Open_Palm')).toBe('open_palm');
    expect(mapCategory('ILoveYou')).toBe('i_love_you');
    expect(mapCategory('None')).toBeNull();
  });
});
