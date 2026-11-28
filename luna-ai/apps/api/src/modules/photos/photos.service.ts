import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { badRequest, notFound } from '../../lib/errors';

const ID_RE = /^[a-f0-9]{16}$/;
const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTOS = 300;

/**
 * Fotos da família para o descanso de tela. Ficam só no servidor da casa, em data/photos/<id>.jpg
 * (a tela reduz e converte para JPEG antes de enviar). Nada vai para a internet.
 */
export class PhotoAlbum {
  private readonly dir: string;
  constructor(dataDir: string) {
    this.dir = join(dataDir, 'photos');
  }

  /** Ids das fotos, da mais antiga para a mais nova */
  async list(): Promise<string[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }
    const items = await Promise.all(
      files
        .map((f) => f.replace(/\.jpg$/, ''))
        .filter((id) => ID_RE.test(id))
        .map(async (id) => ({ id, at: (await stat(this.file(id))).mtimeMs })),
    );
    return items.sort((a, b) => a.at - b.at).map((i) => i.id);
  }

  private file(id: string) {
    if (!ID_RE.test(id)) throw notFound('Foto não encontrada.');
    return join(this.dir, `${id}.jpg`);
  }

  async add(buf: Buffer): Promise<string> {
    if (buf.length < 500 || buf.length > MAX_BYTES) throw badRequest('A foto precisa ter até 3 MB.');
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw badRequest('Envie a foto em JPEG.');
    if ((await this.list()).length >= MAX_PHOTOS) throw badRequest(`O álbum já tem ${MAX_PHOTOS} fotos. Apague algumas para enviar outras.`);
    await mkdir(this.dir, { recursive: true });
    const id = randomBytes(8).toString('hex');
    await writeFile(this.file(id), buf);
    return id;
  }

  async read(id: string) {
    try {
      return await readFile(this.file(id));
    } catch {
      throw notFound('Foto não encontrada.');
    }
  }

  async remove(id: string) {
    await rm(this.file(id), { force: true });
  }
}
