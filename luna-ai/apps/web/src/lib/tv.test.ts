import { describe, expect, it } from 'vitest';
import { isTvDevice, nextFocus, tvKey } from './tv';

describe('modo TV', () => {
  it('reconhece Fire TV e Android TV, mas não celulares', () => {
    expect(isTvDevice('Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.4.1 like Chrome/120.0 Safari/537.36')).toBe(true);
    expect(isTvDevice('Mozilla/5.0 (Linux; Android 11; AFTKRT) Silk/124 like Chrome/124')).toBe(true);
    expect(isTvDevice('Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit Chrome/120 Safari GoogleTV')).toBe(true);
    expect(isTvDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1')).toBe(false);
    expect(isTvDevice('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe(false);
  });

  it('lê as teclas do controle (nomes e códigos do Fire TV)', () => {
    expect(tvKey({ key: 'ArrowLeft', keyCode: 37 })).toBe('left');
    expect(tvKey({ key: 'Enter', keyCode: 13 })).toBe('ok');
    expect(tvKey({ key: 'Unidentified', keyCode: 23 })).toBe('ok');
    expect(tvKey({ key: 'Unidentified', keyCode: 4 })).toBe('back');
    expect(tvKey({ key: 'MediaFastForward', keyCode: 228 })).toBe('next');
    expect(tvKey({ key: 'Unidentified', keyCode: 227 })).toBe('prev');
    expect(tvKey({ key: 'a', keyCode: 65 })).toBeNull();
  });

  it('navega para o item mais alinhado na direção pedida', () => {
    const grid = [
      { left: 0, top: 0, width: 100, height: 50 },
      { left: 120, top: 0, width: 100, height: 50 },
      { left: 0, top: 70, width: 100, height: 50 },
      { left: 120, top: 70, width: 100, height: 50 },
      { left: 400, top: 300, width: 100, height: 50 },
    ];
    expect(nextFocus(grid[0], grid, 'right')).toBe(1);
    expect(nextFocus(grid[0], grid, 'down')).toBe(2);
    expect(nextFocus(grid[3], grid, 'up')).toBe(1);
    expect(nextFocus(grid[3], grid, 'left')).toBe(2);
    expect(nextFocus(grid[0], grid, 'up')).toBe(-1);
    expect(nextFocus(grid[3], grid, 'down')).toBe(4);
  });
});
