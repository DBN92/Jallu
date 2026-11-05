import type { GestureName } from '@luna/shared/types';
import { mapCategory } from './stabilizer';

type Recognizer = {
  recognize: (img: TexImageSource | ImageBitmap) => { gestures: { categoryName: string; score: number }[][]; landmarks: { x: number; y: number }[][] };
  close: () => void;
};

let loading: Promise<Recognizer> | null = null;

/**
 * Carrega o reconhecedor de gestos (MediaPipe, WebAssembly) a partir do próprio servidor da Luna.
 * Roda 100% no aparelho; nenhuma imagem sai dele para analisar.
 */
export function loadRecognizer(): Promise<Recognizer> {
  if (!loading) {
    loading = (async () => {
      const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks('/mediapipe');
      const make = (delegate: 'GPU' | 'CPU') =>
        GestureRecognizer.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/models/gesture_recognizer.task', delegate },
          runningMode: 'IMAGE',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
        });
      try {
        return (await make('GPU')) as unknown as Recognizer;
      } catch {
        return (await make('CPU')) as unknown as Recognizer;
      }
    })().catch((err) => {
      loading = null;
      throw new Error(`Não consegui carregar o reconhecedor de gestos (${(err as Error).message}). Rode a atualização da Luna no servidor.`);
    });
  }
  return loading;
}

export interface Detection {
  gesture: GestureName | null;
  score: number;
  /** Caixa da mão (0–1) para mostrar na prévia */
  box: { x: number; y: number; w: number; h: number } | null;
}

/** Melhor gesto entre as mãos visíveis no quadro. */
export async function detect(img: TexImageSource | ImageBitmap): Promise<Detection> {
  const r = (await loadRecognizer()).recognize(img);
  let best: Detection = { gesture: null, score: 0, box: null };
  r.gestures.forEach((cats, i) => {
    const top = cats[0];
    const g = mapCategory(top?.categoryName);
    if (top && g && top.score > best.score) {
      const pts = r.landmarks[i] ?? [];
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      best = {
        gesture: g,
        score: top.score,
        box: pts.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : null,
      };
    }
  });
  return best;
}

/** Quadro de uma câmera da Luna (área de gestos recortada no servidor). */
export async function cameraFrame(entityId: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(`/api/cameras/${entityId}/gesture-frame?t=${Date.now()}`, { credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`câmera sem imagem (HTTP ${res.status})`);
  return createImageBitmap(await res.blob());
}
