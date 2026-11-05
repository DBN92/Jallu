import type { GestureName } from '@luna/shared/types';

/** Nome da categoria do reconhecedor → nosso nome (null = nenhum gesto). */
export function mapCategory(name: string | undefined | null): GestureName | null {
  switch (name) {
    case 'Open_Palm':
      return 'open_palm';
    case 'Closed_Fist':
      return 'closed_fist';
    case 'Thumb_Up':
      return 'thumb_up';
    case 'Thumb_Down':
      return 'thumb_down';
    case 'Victory':
      return 'victory';
    case 'Pointing_Up':
      return 'pointing_up';
    case 'ILoveYou':
      return 'i_love_you';
    default:
      return null;
  }
}

/**
 * Evita disparos acidentais: o mesmo gesto precisa aparecer em vários quadros seguidos
 * por um tempo mínimo (mão “segurando” o gesto). Depois de disparar, espera a mão sair
 * ou mudar de gesto e respeita um intervalo antes de disparar de novo.
 */
export class GestureStabilizer {
  private current: GestureName | null = null;
  private since = 0;
  private frames = 0;
  private firedCurrent = false;
  private lastFire = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly holdMs = 900,
    private readonly minFrames = 3,
    private readonly cooldownMs = 4000,
    private readonly minScore = 0.6,
  ) {}

  /** Recebe o gesto do quadro atual; retorna o gesto quando deve disparar. */
  push(gesture: GestureName | null, score: number, now: number): GestureName | null {
    const g = gesture && score >= this.minScore ? gesture : null;
    if (g !== this.current) {
      this.current = g;
      this.since = now;
      this.frames = g ? 1 : 0;
      this.firedCurrent = false;
      return null;
    }
    if (!g) return null;
    this.frames++;
    if (this.firedCurrent || now - this.lastFire < this.cooldownMs) return null;
    if (this.frames >= this.minFrames && now - this.since >= this.holdMs) {
      this.firedCurrent = true;
      this.lastFire = now;
      return g;
    }
    return null;
  }
}
