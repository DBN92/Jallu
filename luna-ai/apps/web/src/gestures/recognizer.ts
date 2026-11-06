import type { GestureName } from '@luna/shared/types';
import { mapCategory } from './stabilizer';

type Recognizer = {
  recognize: (img: TexImageSource | ImageBitmap) => { gestures: { categoryName: string; score: number }[][]; landmarks: { x: number; y: number }[][] };
  close: () => void;
};

let loading: Promise<Recognizer> | null = null;

/**
 * Carrega o reconhecedor de gestos (MediaPipe, WebAssembly) a partir do próprio servidor da DIA.
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
          // Mais permissivo para achar mãos pequenas/longe; quem filtra é o estabilizador
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
        });
      try {
        return (await make('GPU')) as unknown as Recognizer;
      } catch {
        return (await make('CPU')) as unknown as Recognizer;
      }
    })().catch((err) => {
      loading = null;
      throw new Error(`Não consegui carregar o reconhecedor de gestos (${(err as Error).message}). Rode a atualização da DIA no servidor.`);
    });
  }
  return loading;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  gesture: GestureName | null;
  score: number;
  /** Caixa da mão (0–1 na imagem inteira) — existe mesmo sem gesto reconhecido */
  box: Box | null;
  /** Como foi achada: imagem inteira, seguindo a mão (zoom) ou procurando por partes */
  via: 'full' | 'track' | 'tile' | null;
}

type Source = TexImageSource | ImageBitmap;
const sizeOf = (img: Source) => (img instanceof HTMLVideoElement ? { w: img.videoWidth, h: img.videoHeight } : { w: (img as ImageBitmap).width, h: (img as ImageBitmap).height });

/** Reconhece numa imagem (ou num recorte dela) e devolve a melhor mão em coordenadas da imagem inteira. */
async function recognizeIn(img: Source, crop: Box | null): Promise<Detection> {
  const rec = await loadRecognizer();
  let input: Source = img;
  let bitmap: ImageBitmap | null = null;
  if (crop) {
    const { w, h } = sizeOf(img);
    bitmap = await createImageBitmap(img as ImageBitmapSource, Math.round(crop.x * w), Math.round(crop.y * h), Math.max(8, Math.round(crop.w * w)), Math.max(8, Math.round(crop.h * h)));
    input = bitmap;
  }
  try {
    const r = rec.recognize(input);
    const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
    let best: Detection = { gesture: null, score: 0, box: null, via: null };
    let bestRank = -1;
    r.landmarks.forEach((pts, i) => {
      const top = r.gestures[i]?.[0];
      const g = mapCategory(top?.categoryName);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const box = { x: c.x + Math.min(...xs) * c.w, y: c.y + Math.min(...ys) * c.h, w: (Math.max(...xs) - Math.min(...xs)) * c.w, h: (Math.max(...ys) - Math.min(...ys)) * c.h };
      // Prefere mão com gesto reconhecido; entre elas, a de maior certeza
      const rank = (g ? 1 : 0) + (top?.score ?? 0) * 0.5;
      if (rank > bestRank) {
        bestRank = rank;
        best = { gesture: g, score: g ? (top?.score ?? 0) : 0, box, via: null };
      }
    });
    return best;
  } finally {
    bitmap?.close();
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Região quadrada em volta da mão (com folga), para analisar “com zoom” no próximo quadro. */
function around(b: Box, imgW: number, imgH: number, factor = 2.6): Box {
  const side = Math.max(b.w * imgW, b.h * imgH) * factor;
  const cx = (b.x + b.w / 2) * imgW;
  const cy = (b.y + b.h / 2) * imgH;
  const w = Math.min(imgW, Math.max(160, side));
  const h = Math.min(imgH, Math.max(160, side));
  const x = clamp01((cx - w / 2) / imgW);
  const y = clamp01((cy - h / 2) / imgH);
  return { x: Math.min(x, 1 - w / imgW), y: Math.min(y, 1 - h / imgH), w: w / imgW, h: h / imgH };
}

/**
 * Análise por câmera com memória:
 * 1. se achou a mão no quadro anterior, analisa só a região em volta dela (a mão fica grande → mais acerto);
 * 2. senão, a imagem inteira;
 * 3. sem mão e imagem grande: procura em 4 partes ampliadas (mãos pequenas/longe), alternando a cada quadro.
 */
export class HandTracker {
  private roi: Box | null = null;
  private misses = 0;
  private tile = 0;

  async analyze(img: Source): Promise<Detection> {
    const { w, h } = sizeOf(img);
    if (!w || !h) return { gesture: null, score: 0, box: null, via: null };

    if (this.roi) {
      const d = await recognizeIn(img, this.roi);
      if (d.box) {
        this.misses = 0;
        this.roi = around(d.box, w, h);
        return { ...d, via: 'track' };
      }
      if (++this.misses >= 3) this.roi = null; // perdeu a mão
    }

    const full = await recognizeIn(img, null);
    if (full.box) {
      this.roi = around(full.box, w, h);
      this.misses = 0;
      return { ...full, via: 'full' };
    }

    // Imagem grande e nenhuma mão: tenta uma das 4 partes (com sobreposição) por quadro
    if (w >= 700 || h >= 700) {
      const tiles: Box[] = [
        { x: 0, y: 0, w: 0.6, h: 0.6 },
        { x: 0.4, y: 0, w: 0.6, h: 0.6 },
        { x: 0, y: 0.4, w: 0.6, h: 0.6 },
        { x: 0.4, y: 0.4, w: 0.6, h: 0.6 },
      ];
      const t = tiles[this.tile++ % tiles.length]!;
      const d = await recognizeIn(img, t);
      if (d.box) {
        this.roi = around(d.box, w, h);
        this.misses = 0;
        return { ...d, via: 'tile' };
      }
    }
    return { gesture: null, score: 0, box: null, via: null };
  }
}

/** Uso simples (sem memória entre quadros). */
export async function detect(img: Source): Promise<Detection> {
  const d = await recognizeIn(img, null);
  return { ...d, via: d.box ? 'full' : null };
}

/** Quadro de uma câmera da DIA (área de gestos recortada no servidor). */
export async function cameraFrame(entityId: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(`/api/cameras/${entityId}/gesture-frame?t=${Date.now()}`, { credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`câmera sem imagem (HTTP ${res.status})`);
  return createImageBitmap(await res.blob());
}
