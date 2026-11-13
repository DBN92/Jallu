import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RecadoDto } from '@luna/shared';
import { badRequest, notFound } from '../../lib/errors';

const ID_RE = /^[a-f0-9]{16}$/;
const MAX_BYTES = 10 * 1024 * 1024;
/** Recados somem sozinhos depois de 7 dias */
export const RECADO_TTL_MS = 7 * 24 * 3600_000;
const MAX_RECADOS = 50;

type Meta = { id: string; fromId: string; fromName: string; createdAt: string; mime: 'video/webm' | 'video/mp4'; seenAt: string | null };

/** Começo do arquivo: WebM (Android/Chrome) ou MP4 (iPhone) */
function sniff(buf: Buffer): Meta['mime'] | null {
  if (buf.length > 12 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  if (buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp') return 'video/mp4';
  return null;
}

/**
 * Recados em vídeo deixados na tela (ex.: “fui ao mercado”). Ficam só no servidor da casa,
 * em data/recados/<id>.video + <id>.json, e são apagados sozinhos depois de 7 dias.
 */
export class RecadosService {
  private readonly dir: string;
  constructor(dataDir: string, private readonly onChange: () => void = () => {}) {
    this.dir = join(dataDir, 'recados');
  }

  private path(id: string, ext: 'json' | 'video') {
    if (!ID_RE.test(id)) throw notFound('Recado não encontrado.');
    return join(this.dir, `${id}.${ext}`);
  }

  private async metas(): Promise<Meta[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }
    const out: Meta[] = [];
    for (const f of files) {
      const id = f.replace(/\.json$/, '');
      if (!f.endsWith('.json') || !ID_RE.test(id)) continue;
      try {
        const m = JSON.parse(await readFile(this.path(id, 'json'), 'utf8')) as Meta;
        if (Date.now() - new Date(m.createdAt).getTime() > RECADO_TTL_MS) await this.drop(id);
        else out.push(m);
      } catch {
        /* arquivo pela metade: ignora */
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async list(): Promise<RecadoDto[]> {
    return (await this.metas()).map(({ id, fromName, createdAt, seenAt }) => ({ id, fromName, createdAt, seen: !!seenAt }));
  }

  async add(buf: Buffer, from: { id: string; displayName: string }): Promise<RecadoDto[]> {
    if (buf.length < 1000 || buf.length > MAX_BYTES) throw badRequest('O recado precisa ter até 10 MB (uns 30 segundos).');
    const mime = sniff(buf);
    if (!mime) throw badRequest('Formato de vídeo não reconhecido.');
    const all = await this.metas();
    if (all.length >= MAX_RECADOS) throw badRequest('Já há muitos recados guardados. Apague alguns antes.');
    await mkdir(this.dir, { recursive: true });
    const id = randomBytes(8).toString('hex');
    await writeFile(this.path(id, 'video'), buf);
    const meta: Meta = { id, fromId: from.id, fromName: from.displayName, createdAt: new Date().toISOString(), mime, seenAt: null };
    await writeFile(this.path(id, 'json'), JSON.stringify(meta));
    this.onChange();
    return this.list();
  }

  private async meta(id: string): Promise<Meta> {
    try {
      return JSON.parse(await readFile(this.path(id, 'json'), 'utf8')) as Meta;
    } catch {
      throw notFound('Recado não encontrado.');
    }
  }

  /** Pedaço do vídeo (o iPhone só toca vídeo servido em partes) */
  async video(id: string, range?: string) {
    const m = await this.meta(id);
    const file = this.path(id, 'video');
    const size = (await stat(file)).size;
    let start = 0;
    let end = size - 1;
    const r = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (r && (r[1] || r[2])) {
      if (r[1]) {
        start = Number(r[1]);
        if (r[2]) end = Math.min(end, Number(r[2]));
      } else start = Math.max(0, size - Number(r[2]));
      if (start > end || start >= size) return { mime: m.mime, size, start: 0, end: -1, partial: true, data: Buffer.alloc(0) };
    }
    const fh = await open(file, 'r');
    try {
      const data = Buffer.alloc(end - start + 1);
      await fh.read(data, 0, data.length, start);
      return { mime: m.mime, size, start, end, partial: !!r, data };
    } finally {
      await fh.close();
    }
  }

  async markSeen(id: string) {
    const m = await this.meta(id);
    if (!m.seenAt) {
      m.seenAt = new Date().toISOString();
      await writeFile(this.path(id, 'json'), JSON.stringify(m));
      this.onChange();
    }
    return this.list();
  }

  private async drop(id: string) {
    await rm(this.path(id, 'video'), { force: true });
    await rm(this.path(id, 'json'), { force: true });
  }

  async remove(id: string) {
    await this.meta(id);
    await this.drop(id);
    this.onChange();
    return this.list();
  }

  /** Frase para a voz: “Você tem 2 recados novos: de Daniel às 14:32 e de Ana às 15:10.” */
  async unseenText(tz: string): Promise<{ text: string; count: number }> {
    const fresh = (await this.metas()).filter((m) => !m.seenAt).reverse();
    if (!fresh.length) return { text: 'Não há recados novos.', count: 0 };
    const hour = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const parts = fresh.slice(0, 4).map((m) => `de ${m.fromName} às ${hour(m.createdAt)}`);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : parts[0];
    return { text: `Você tem ${fresh.length === 1 ? 'um recado novo' : `${fresh.length} recados novos`}: ${list}. Abrindo na tela.`, count: fresh.length };
  }
}
