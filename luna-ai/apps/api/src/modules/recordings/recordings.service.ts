import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, rm, rmdir, stat, statfs } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { CameraDto, RecordingCameraDto, RecordingDayDto, RecordingFileDto, RecordingsDto } from '@luna/shared';
import { badRequest, notFound } from '../../lib/errors';

/** Cada arquivo tem 10 minutos (começando em hora “redonda”: 14-00, 14-10…) */
const SEGMENT_S = 600;
/** Abaixo disto de espaço livre, apaga os dias mais antigos mesmo antes dos 7 dias */
const MIN_FREE = 0.1;

interface Saved {
  cameras?: Record<string, boolean>;
  keepDays?: number;
}

interface Recorder {
  entityId: string;
  name: string;
  proc: ChildProcess | null;
  status: 'iniciando' | 'gravando' | 'erro' | 'sem-video';
  error: string | null;
  since: number;
  /** Tentativas seguidas que falharam (espera cresce até 1 min) */
  fails: number;
  timer: NodeJS.Timeout | null;
  stopped: boolean;
}

export interface RecordingsDeps {
  ffmpeg: () => string | null;
  /** Entrada do ffmpeg da câmera; null = sem vídeo para gravar */
  input: (entityId: string) => Promise<string[] | null>;
  cameras: () => Promise<CameraDto[]>;
  tz: string;
  log?: (msg: string) => void;
  /** Fração livre do disco (para testes); padrão: statfs da pasta */
  freeRatio?: (dir: string) => Promise<number | null>;
}

/** Nome da pasta da câmera: o nome dela, sem caracteres que atrapalham em pastas */
export function folderName(name: string, entityId: string) {
  const s = name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return s && s !== '.' && s !== '..' ? s : entityId.replace(/^camera\./, '');
}

/** Argumentos do ffmpeg: copia o vídeo (sem recomprimir), áudio em AAC, arquivos de 10 min em Câmera/ano/mês/dia/HH-MM-SS.mp4 */
export function recordArgs(input: string[], dir: string, folder: string) {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error',
    ...input,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k',
    '-f', 'segment', '-segment_time', String(SEGMENT_S), '-segment_atclocktime', '1', '-reset_timestamps', '1',
    '-strftime', '1',
    '-segment_format', 'mp4', '-segment_format_options', 'movflags=+frag_keyframe+empty_moov+default_base_moof',
    join(dir, folder, '%Y', '%m', '%d', '%H-%M-%S.mp4'),
  ];
}

/** Pasta ano/mês/dia de uma data no fuso da casa */
export function dayPath(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return join(p.year!, p.month!, p.day!);
}

/**
 * Gravação das câmeras no servidor (Luna): liga/desliga por câmera, vídeo contínuo sem recomprimir
 * (o Mac mini só copia o que a câmera manda), em pastas Câmera/ano/mês/dia. Guarda 7 dias e apaga os
 * dias mais antigos antes, se o disco ficar com menos de 10% livre. Se a câmera cair, tenta de novo.
 */
export class RecordingsService {
  private file: string;
  private saved: Saved;
  private recorders = new Map<string, Recorder>();
  private cleaner: NodeJS.Timeout | null = null;
  private dayTimer: NodeJS.Timeout | null = null;

  constructor(
    dataDir: string,
    readonly dir: string,
    private readonly deps: RecordingsDeps,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'recordings.json');
    try {
      this.saved = JSON.parse(readFileSync(this.file, 'utf8')) as Saved;
    } catch {
      this.saved = {};
    }
  }

  get keepDays() {
    return this.saved.keepDays ?? 7;
  }

  private write() {
    writeFileSync(this.file, JSON.stringify(this.saved, null, 2), { mode: 0o600 });
  }

  /** Liga as gravações salvas e a limpeza de hora em hora */
  async start() {
    const on = Object.entries(this.saved.cameras ?? {}).filter(([, v]) => v);
    if (!on.length) return;
    const names = new Map((await this.deps.cameras().catch(() => [])).map((c) => [c.entityId, c.name]));
    for (const [id] of on) this.begin(id, names.get(id) ?? id);
    this.scheduleCleanup();
  }

  stop() {
    for (const r of this.recorders.values()) this.halt(r);
    this.recorders.clear();
    if (this.cleaner) clearInterval(this.cleaner);
    if (this.dayTimer) clearInterval(this.dayTimer);
    this.cleaner = null;
    this.dayTimer = null;
  }

  /**
   * O ffmpeg não cria pastas sozinho: deixa prontas as de hoje e de amanhã de cada câmera gravando
   * (refeito a cada 30 min, então a virada do dia sempre encontra a pasta criada).
   */
  private ensureDays(folder: string) {
    const now = Date.now();
    for (const t of [now, now + 86_400_000]) mkdirSync(join(this.dir, folder, dayPath(new Date(t), this.deps.tz)), { recursive: true });
  }

  private scheduleCleanup() {
    if (!this.dayTimer) {
      this.dayTimer = setInterval(() => {
        for (const r of this.recorders.values())
          if (!r.stopped)
            try {
              this.ensureDays(folderName(r.name, r.entityId));
            } catch {
              /* sem permissão: o erro aparece na próxima tentativa */
            }
      }, 30 * 60_000);
      this.dayTimer.unref();
    }
    if (this.cleaner) return;
    void this.cleanup();
    this.cleaner = setInterval(() => void this.cleanup(), 60 * 60_000);
    this.cleaner.unref();
  }

  async status(): Promise<RecordingsDto> {
    const cams = await this.deps.cameras().catch(() => [] as CameraDto[]);
    const disk = await statfs(existsSync(this.dir) ? this.dir : '/').catch(() => null);
    const list: RecordingCameraDto[] = cams.map((c) => {
      const r = this.recorders.get(c.entityId);
      const enabled = !!this.saved.cameras?.[c.entityId];
      return {
        entityId: c.entityId,
        name: c.name,
        folder: folderName(c.name, c.entityId),
        enabled,
        supported: c.platform !== 'web' && (c.stream || c.entityId.startsWith('camera.luna_')),
        status: !enabled ? 'desligada' : (r?.status ?? 'iniciando'),
        error: enabled ? (r?.error ?? null) : null,
        since: enabled && r ? new Date(r.since).toISOString() : null,
      };
    });
    return {
      dir: this.dir,
      keepDays: this.keepDays,
      ffmpeg: !!this.deps.ffmpeg(),
      freeBytes: disk ? Number(disk.bavail) * Number(disk.bsize) : null,
      totalBytes: disk ? Number(disk.blocks) * Number(disk.bsize) : null,
      cameras: list,
    };
  }

  async setEnabled(entityId: string, on: boolean) {
    const cams = await this.deps.cameras();
    const cam = cams.find((c) => c.entityId === entityId);
    if (!cam) throw badRequest('Câmera não encontrada.');
    if (on && !this.deps.ffmpeg()) throw badRequest('O conversor de vídeo (ffmpeg) não está instalado no servidor.');
    this.saved.cameras = { ...this.saved.cameras, [entityId]: on };
    this.write();
    const r = this.recorders.get(entityId);
    if (r) {
      this.halt(r);
      this.recorders.delete(entityId);
    }
    if (on) {
      this.begin(entityId, cam.name);
      this.scheduleCleanup();
    }
    return this.status();
  }

  private begin(entityId: string, name: string) {
    const r: Recorder = { entityId, name, proc: null, status: 'iniciando', error: null, since: Date.now(), fails: 0, timer: null, stopped: false };
    this.recorders.set(entityId, r);
    void this.launch(r);
  }

  private halt(r: Recorder) {
    r.stopped = true;
    if (r.timer) clearTimeout(r.timer);
    // “q” fecha o arquivo direitinho; se não sair, encerra
    if (r.proc && r.proc.exitCode === null) {
      r.proc.kill('SIGINT');
      const p = r.proc;
      setTimeout(() => p.exitCode === null && p.kill('SIGKILL'), 5000).unref();
    }
  }

  private retry(r: Recorder, error: string) {
    if (r.stopped) return;
    r.fails++;
    r.status = 'erro';
    r.error = error;
    const wait = Math.min(60_000, 5000 * r.fails);
    r.timer = setTimeout(() => void this.launch(r), wait);
    r.timer.unref();
  }

  private async launch(r: Recorder) {
    if (r.stopped) return;
    const ff = this.deps.ffmpeg();
    if (!ff) return this.retry(r, 'ffmpeg não instalado');
    let input: string[] | null;
    try {
      input = await this.deps.input(r.entityId);
    } catch (e) {
      return this.retry(r, (e as Error).message);
    }
    if (r.stopped) return;
    if (!input) {
      r.status = 'sem-video';
      r.error = 'Esta câmera só manda imagens (sem vídeo contínuo).';
      return;
    }
    try {
      this.ensureDays(folderName(r.name, r.entityId));
    } catch (e) {
      return this.retry(r, `Sem permissão para gravar em ${this.dir}: ${(e as Error).message}`);
    }
    const proc = spawn(ff, recordArgs(input, this.dir, folderName(r.name, r.entityId)), { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TZ: this.deps.tz } });
    r.proc = proc;
    r.status = 'gravando';
    r.since = Date.now();
    let err = '';
    proc.stderr?.on('data', (d: Buffer) => {
      err = (err + d.toString()).slice(-600);
    });
    // Ficou de pé por 2 min: zera a contagem de falhas
    const ok = setTimeout(() => {
      r.fails = 0;
      r.error = null;
    }, 120_000);
    ok.unref();
    proc.on('error', (e) => {
      clearTimeout(ok);
      this.retry(r, e.message);
    });
    proc.on('exit', (code) => {
      clearTimeout(ok);
      if (r.proc !== proc || r.stopped) return;
      r.proc = null;
      const last = err.trim().split('\n').pop() ?? '';
      this.deps.log?.(`[gravação] ${r.name} parou (código ${code}): ${last}`);
      this.retry(r, last || `a gravação parou (código ${code})`);
    });
  }

  /* ---------- assistir ---------- */

  /** Pasta da câmera (pelo nome atual dela) */
  private async camDir(entityId: string) {
    const cam = (await this.deps.cameras().catch(() => [] as CameraDto[])).find((c) => c.entityId === entityId);
    if (!cam) throw notFound('Câmera não encontrada.');
    return join(this.dir, folderName(cam.name, cam.entityId));
  }

  /** Dias com gravação desta câmera (mais recente primeiro) */
  async days(entityId: string): Promise<RecordingDayDto[]> {
    const base = await this.camDir(entityId);
    const out: RecordingDayDto[] = [];
    for (const y of (await readdir(base).catch(() => [])).filter((x) => /^\d{4}$/.test(x)))
      for (const m of (await readdir(join(base, y)).catch(() => [])).filter((x) => /^\d{2}$/.test(x)))
        for (const d of (await readdir(join(base, y, m)).catch(() => [])).filter((x) => /^\d{2}$/.test(x))) {
          const files = (await readdir(join(base, y, m, d)).catch(() => [])).filter((f) => /^\d{2}-\d{2}-\d{2}\.mp4$/.test(f));
          if (files.length) out.push({ date: `${y}-${m}-${d}`, files: files.length });
        }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Arquivos de um dia, em ordem, com início e duração aproximada (até o próximo arquivo, no máximo 10 min) */
  async files(entityId: string, date: string): Promise<RecordingFileDto[]> {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw badRequest('Data inválida.');
    const dir = join(await this.camDir(entityId), m[1]!, m[2]!, m[3]!);
    const names = (await readdir(dir).catch(() => [])).filter((f) => /^\d{2}-\d{2}-\d{2}\.mp4$/.test(f)).sort();
    const sec = (f: string) => {
      const [h, mi, s] = f.slice(0, 8).split('-').map(Number);
      return h! * 3600 + mi! * 60 + s!;
    };
    const out: RecordingFileDto[] = [];
    for (let i = 0; i < names.length; i++) {
      const st = await stat(join(dir, names[i]!)).catch(() => null);
      if (!st || st.size < 1024) continue; // arquivo vazio (gravação que não pegou)
      const start = sec(names[i]!);
      // Último arquivo (talvez ainda gravando): do momento em que foi criado até a última escrita
      const seconds = names[i + 1]
        ? Math.min(sec(names[i + 1]!) - start, SEGMENT_S)
        : st.birthtimeMs > 0
          ? Math.min(SEGMENT_S, Math.round((st.mtimeMs - st.birthtimeMs) / 1000))
          : SEGMENT_S;
      out.push({ file: names[i]!, start, seconds: Math.max(1, seconds), bytes: st.size });
    }
    return out;
  }

  /** Abre o arquivo para assistir (com pedaços, para avançar/voltar no vídeo) */
  async open(entityId: string, date: string, file: string, range?: string) {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m || !/^\d{2}-\d{2}-\d{2}\.mp4$/.test(file)) throw badRequest('Arquivo inválido.');
    const path = join(await this.camDir(entityId), m[1]!, m[2]!, m[3]!, file);
    const st = await stat(path).catch(() => null);
    if (!st?.isFile()) throw notFound('Gravação não encontrada.');
    const size = st.size;
    const r = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (r && (r[1] || r[2])) {
      let startB = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2]));
      let endB = r[1] && r[2] ? Number(r[2]) : size - 1;
      endB = Math.min(endB, size - 1);
      if (startB > endB) startB = endB;
      return { status: 206, size, start: startB, end: endB, stream: createReadStream(path, { start: startB, end: endB }) };
    }
    return { status: 200, size, start: 0, end: size - 1, stream: createReadStream(path) };
  }

  /**
   * Apaga os dias além do prazo (pastas ano/mês/dia) e, se o disco estiver com menos de 10% livre,
   * os dias mais antigos de todas as câmeras até liberar espaço. Pastas vazias somem.
   */
  async cleanup(now = new Date()) {
    if (!existsSync(this.dir)) return { removed: [] as string[] };
    const days: { path: string; date: string }[] = [];
    for (const cam of await readdir(this.dir).catch(() => [])) {
      const camDir = join(this.dir, cam);
      if (!(await stat(camDir).catch(() => null))?.isDirectory()) continue;
      for (const y of (await readdir(camDir).catch(() => [])).filter((x) => /^\d{4}$/.test(x)))
        for (const m of (await readdir(join(camDir, y)).catch(() => [])).filter((x) => /^\d{2}$/.test(x)))
          for (const d of (await readdir(join(camDir, y, m)).catch(() => [])).filter((x) => /^\d{2}$/.test(x))) days.push({ path: join(camDir, y, m, d), date: `${y}-${m}-${d}` });
    }
    const limit = new Date(now.getTime() - this.keepDays * 86_400_000);
    const cut = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
    const removed: string[] = [];
    const drop = async (p: string) => {
      await rm(p, { recursive: true, force: true });
      removed.push(p);
      // sobe apagando mês/ano vazios
      for (const up of [join(p, '..'), join(p, '..', '..')]) await rmdir(up).catch(() => undefined);
    };
    for (const d of days.filter((x) => x.date < cut)) await drop(d.path);
    const left = days.filter((x) => !removed.includes(x.path)).sort((a, b) => a.date.localeCompare(b.date));
    const today = left.at(-1)?.date;
    for (const d of left) {
      const free = this.deps.freeRatio ? await this.deps.freeRatio(this.dir) : await statfs(this.dir).then((d) => Number(d.bavail) / Number(d.blocks), () => null);
      if (free === null || free >= MIN_FREE) break;
      if (d.date === today) break; // nunca apaga o dia de hoje
      await drop(d.path);
    }
    if (removed.length) this.deps.log?.(`[gravação] apagados ${removed.length} dia(s) antigos`);
    return { removed };
  }
}
