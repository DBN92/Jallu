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

export type Sensitivity = 'alta' | 'normal' | 'precisa';

export interface StabilizerOptions {
  /** Certeza mínima do reconhecedor (0–1) para o quadro contar */
  minScore: number;
  /** Tempo que o gesto precisa ser mantido */
  holdMs: number;
  /** Quadros mínimos com o gesto dentro da janela */
  minFrames: number;
  /** Fração mínima dos quadros recentes com o gesto (tolera falhas) */
  ratio: number;
  /** Intervalo mínimo entre dois disparos */
  cooldownMs: number;
}

export const SENSITIVITY: Record<Sensitivity, StabilizerOptions> = {
  // Mais fácil de acionar (câmera longe/escura); pode errar mais
  alta: { minScore: 0.45, holdMs: 600, minFrames: 2, ratio: 0.5, cooldownMs: 3000 },
  normal: { minScore: 0.55, holdMs: 800, minFrames: 3, ratio: 0.6, cooldownMs: 4000 },
  // Exige gesto claro e mais longo; quase não aciona sem querer
  precisa: { minScore: 0.7, holdMs: 1100, minFrames: 4, ratio: 0.75, cooldownMs: 5000 },
};

/**
 * Evita disparos acidentais sem ser “frágil”: olha uma janela de quadros recentes e dispara quando
 * o mesmo gesto aparece na maioria deles por tempo suficiente — um quadro perdido no meio
 * (mão borrada, reconhecedor indeciso) não cancela mais o gesto. Depois de disparar, o mesmo gesto
 * só vale de novo quando a mão sair ou mudar de gesto.
 */
export class GestureStabilizer {
  private hist: { g: GestureName | null; t: number }[] = [];
  private lastFire = Number.NEGATIVE_INFINITY;
  private held: GestureName | null = null; // gesto já disparado e ainda mantido
  private readonly o: StabilizerOptions;

  constructor(opts: Partial<StabilizerOptions> = {}) {
    this.o = { ...SENSITIVITY.normal, ...opts };
  }

  /** Recebe o gesto do quadro atual; retorna o gesto quando deve disparar. */
  push(gesture: GestureName | null, score: number, now: number): GestureName | null {
    const g = gesture && score >= this.o.minScore ? gesture : null;
    const windowMs = this.o.holdMs * 1.6;
    this.hist.push({ g, t: now });
    while (this.hist.length && now - this.hist[0]!.t > windowMs) this.hist.shift();

    // Gesto dominante na janela
    const counts = new Map<GestureName, number>();
    for (const h of this.hist) if (h.g) counts.set(h.g, (counts.get(h.g) ?? 0) + 1);
    let best: GestureName | null = null;
    let n = 0;
    for (const [k, v] of counts) if (v > n) (best = k), (n = v);

    // Gesto disparado só “libera” quando some da maioria dos quadros recentes
    if (this.held && (best !== this.held || n / this.hist.length < this.o.ratio * 0.5)) this.held = null;
    if (!best || best === this.held || now - this.lastFire < this.o.cooldownMs) return null;

    const first = this.hist.find((h) => h.g === best)!.t;
    if (n >= this.o.minFrames && n / this.hist.length >= this.o.ratio && now - first >= this.o.holdMs) {
      this.lastFire = now;
      this.held = best;
      return best;
    }
    return null;
  }
}
