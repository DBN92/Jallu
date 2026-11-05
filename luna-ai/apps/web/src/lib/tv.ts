/**
 * Utilitários do modo TV (Fire TV / Android TV): detecção do aparelho,
 * leitura das teclas do controle remoto e navegação espacial (setas → item mais próximo).
 */

/** Fire TV (modelos “AFT…”, navegador Silk) e Android/Google TV. */
export function isTvDevice(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /\bAFT[A-Z0-9]{1,6}\b|Fire ?TV|Android ?TV|GoogleTV|Google TV|BRAVIA|SmartTV|SMART-TV|\bTV Safari\b|AppleTV|Tizen|Web0S|WebOS/i.test(ua);
}

export type TvKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'prev' | 'next' | 'play';

/** Converte o evento de teclado em uma tecla do controle (null = não é do controle). */
export function tvKey(e: Pick<KeyboardEvent, 'key' | 'keyCode'>): TvKey | null {
  switch (e.key) {
    case 'ArrowUp':
    case 'Up':
      return 'up';
    case 'ArrowDown':
    case 'Down':
      return 'down';
    case 'ArrowLeft':
    case 'Left':
      return 'left';
    case 'ArrowRight':
    case 'Right':
      return 'right';
    case 'Enter':
    case ' ':
    case 'Select':
      return 'ok';
    case 'Escape':
    case 'Esc':
    case 'Backspace':
    case 'GoBack':
    case 'BrowserBack':
      return 'back';
    case 'MediaRewind':
    case 'MediaTrackPrevious':
    case 'PageUp':
      return 'prev';
    case 'MediaFastForward':
    case 'MediaTrackNext':
    case 'PageDown':
      return 'next';
    case 'MediaPlayPause':
    case 'MediaPlay':
    case 'MediaPause':
      return 'play';
  }
  switch (e.keyCode) {
    case 38:
      return 'up';
    case 40:
      return 'down';
    case 37:
      return 'left';
    case 39:
      return 'right';
    case 13:
    case 23: // DPAD_CENTER
      return 'ok';
    case 4: // BACK (Android)
    case 8:
    case 27:
      return 'back';
    case 227:
    case 412:
      return 'prev';
    case 228:
    case 417:
      return 'next';
    case 179:
    case 85:
      return 'play';
  }
  return null;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Escolhe o próximo item na direção pedida: só considera itens que ficam daquele lado
 * e prefere os mais alinhados (distância no eixo principal + 2× o desvio lateral).
 * Retorna o índice em `boxes` ou -1 se não houver nada naquela direção.
 */
export function nextFocus(from: Box, boxes: Box[], dir: 'up' | 'down' | 'left' | 'right'): number {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((b, i) => {
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    let main: number;
    let cross: number;
    if (dir === 'left' || dir === 'right') {
      main = dir === 'right' ? b.left - (from.left + from.width) : from.left - (b.left + b.width);
      // sobreposição parcial ainda conta como “ao lado”
      if ((dir === 'right' ? bx - cx : cx - bx) <= 4) return;
      cross = Math.abs(by - cy);
    } else {
      main = dir === 'down' ? b.top - (from.top + from.height) : from.top - (b.top + b.height);
      if ((dir === 'down' ? by - cy : cy - by) <= 4) return;
      cross = Math.abs(bx - cx);
    }
    const score = Math.max(0, main) + cross * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
