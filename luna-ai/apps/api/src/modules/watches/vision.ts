import { spawn } from 'node:child_process';

/** Assinatura de imagem: 32×24 pixels em tons de cinza (768 bytes). Barata e suficiente p/ câmera fixa. */
export const FW = 32;
export const FH = 24;

export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

const crop = (z: Zone | null) =>
  z ? `crop=trunc(iw*${z.w.toFixed(4)}/2)*2:trunc(ih*${z.h.toFixed(4)}/2)*2:trunc(iw*${z.x.toFixed(4)}):trunc(ih*${z.y.toFixed(4)}),` : '';

function run(ff: string, args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((done, fail) => {
    const p = spawn(ff, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 'image2pipe', '-i', 'pipe:0', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-500)));
    const t = setTimeout(() => p.kill('SIGKILL'), 15_000);
    p.on('close', (code) => {
      clearTimeout(t);
      code === 0 ? done(Buffer.concat(out)) : fail(new Error(`ffmpeg: ${err.trim() || code}`));
    });
    p.stdin.on('error', () => undefined);
    p.stdin.end(input);
  });
}

/** Recorta a área e reduz para 32×24 em cinza. */
export async function feature(ff: string, jpeg: Buffer, zone: Zone | null): Promise<Uint8Array> {
  const raw = await run(ff, ['-vf', `${crop(zone)}scale=${FW}:${FH}:flags=area,format=gray`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], jpeg);
  if (raw.length !== FW * FH) throw new Error('assinatura de imagem inválida');
  return new Uint8Array(raw);
}

/** Miniatura JPEG da área (para Ajustes e eventos). */
export function thumbnail(ff: string, jpeg: Buffer, zone: Zone | null, width = 320): Promise<Buffer> {
  return run(ff, ['-vf', `${crop(zone)}scale='min(${width},iw)':-2`, '-frames:v', '1', '-q:v', '5', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], jpeg);
}

/** Normaliza brilho/contraste (dia/noite parecidos ficam comparáveis). */
function norm(v: Uint8Array): Float32Array {
  let mean = 0;
  for (const x of v) mean += x;
  mean /= v.length;
  let sd = 0;
  for (const x of v) sd += (x - mean) ** 2;
  sd = Math.max(6, Math.sqrt(sd / v.length)); // imagem quase lisa: não amplifica ruído
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = (v[i]! - mean) / sd;
  return out;
}

/** Distância entre duas assinaturas (0 = iguais; ~2 = sem relação). */
export function distance(a: Uint8Array, b: Uint8Array): number {
  const na = norm(a);
  const nb = norm(b);
  let s = 0;
  for (let i = 0; i < na.length; i++) s += (na[i]! - nb[i]!) ** 2;
  return s / na.length;
}

/**
 * Qual estado (A ou B) mais se parece com a imagem atual, comparando com as fotos de referência.
 * Confiança 0–1 pela diferença entre as distâncias. null se faltar referência de algum estado.
 */
export function classify(cur: Uint8Array, refs: { state: string; vec: Uint8Array }[]) {
  const best = (s: string) => Math.min(...refs.filter((r) => r.state === s).map((r) => distance(cur, r.vec)));
  if (!refs.some((r) => r.state === 'a') || !refs.some((r) => r.state === 'b')) return null;
  const dA = best('a');
  const dB = best('b');
  const state = dA <= dB ? 'a' : 'b';
  const confidence = Math.abs(dA - dB) / Math.max(1e-6, dA + dB);
  return { state, confidence, dA, dB };
}

/** Quanto a imagem mudou desde a anterior (0–1), sem normalizar: acender de luz também conta. */
export function change(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / a.length / 255;
}

export const toB64 = (v: Uint8Array) => Buffer.from(v).toString('base64');
export const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
