import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PROJECT_ROOT } from '../../config/env';

/** Tira o que não se fala (emojis, marcações) e junta numa linha só (o Piper fala uma linha por vez) */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[*_#`>|~]+/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

interface Job {
  resolve: (wav: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Voz da Luna (Piper + voz “Dii”): gera a fala no próprio servidor, grátis e sem internet.
 * Mantém um Piper aberto (a voz carrega uma vez só): cada linha de texto vira um arquivo WAV,
 * e o caminho dele volta pela saída do Piper, na mesma ordem dos pedidos.
 */
export class PiperTts {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private jobs: Job[] = [];
  private out = '';
  private readonly dir = join(tmpdir(), `luna-tts-${process.pid}`);
  private cache = new Map<string, Buffer>();
  readonly bin: string;
  readonly model: string;

  constructor(
    opts: { bin?: string; model?: string; lengthScale?: number } = {},
    private readonly log: (msg: string) => void = () => {},
  ) {
    const base = resolve(PROJECT_ROOT, 'runtime', 'piper');
    this.bin = opts.bin || join(base, 'piper', 'piper');
    this.model = opts.model || join(base, 'dii_pt-BR.onnx');
    this.lengthScale = opts.lengthScale ?? 0.88;
  }
  private readonly lengthScale: number;

  get available() {
    return existsSync(this.bin) && existsSync(this.model);
  }

  private async start() {
    await mkdir(this.dir, { recursive: true });
    const p = spawn(this.bin, ['-m', this.model, '--length_scale', String(this.lengthScale), '--output_dir', this.dir], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = p;
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk: string) => {
      this.out += chunk;
      let nl: number;
      while ((nl = this.out.indexOf('\n')) >= 0) {
        const file = this.out.slice(0, nl).trim();
        this.out = this.out.slice(nl + 1);
        const job = this.jobs.shift();
        if (!job || !file) continue;
        clearTimeout(job.timer);
        readFile(file)
          .then((wav) => job.resolve(wav))
          .catch((err: Error) => job.reject(err))
          .finally(() => void rm(file, { force: true }));
      }
    });
    p.stderr.resume(); // o Piper escreve o andamento ali; não precisa guardar
    p.on('exit', (code) => {
      if (this.proc === p) this.proc = null;
      for (const j of this.jobs.splice(0)) {
        clearTimeout(j.timer);
        j.reject(new Error(`A voz da Luna parou (código ${code}).`));
      }
    });
    p.on('error', (err) => this.log(`piper: ${err.message}`));
  }

  /** Fala o texto e devolve o áudio (WAV). Frases repetidas vêm da memória. */
  async speak(raw: string): Promise<Buffer> {
    const text = cleanForSpeech(raw);
    if (!text) throw new Error('Nada para falar.');
    const hit = this.cache.get(text);
    if (hit) {
      this.cache.delete(text);
      this.cache.set(text, hit);
      return hit;
    }
    if (!this.available) throw new Error('A voz da Luna não está instalada (rode: sudo bash scripts/piper-setup.sh).');
    if (!this.proc) await this.start();
    const wav = await new Promise<Buffer>((resolveJob, reject) => {
      const timer = setTimeout(() => {
        // Travou: reinicia o Piper (os pedidos pendentes falham e a tela usa a voz do aparelho)
        this.log('piper: sem resposta em 20 s, reiniciando');
        this.proc?.kill();
        this.proc = null;
      }, 20_000);
      this.jobs.push({ resolve: resolveJob, reject, timer });
      this.proc!.stdin.write(`${text}\n`);
    });
    this.cache.set(text, wav);
    if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value!);
    return wav;
  }

  stop() {
    this.proc?.kill();
    this.proc = null;
  }
}
