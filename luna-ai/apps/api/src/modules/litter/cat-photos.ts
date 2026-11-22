import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { badRequest, notFound } from '../../lib/errors';

const ID_RE = /^[a-z0-9]{6,40}$/i;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Foto do rosto de cada gato (avatar). Fica em data/cat-photos/<id do gato>.jpg; o app recorta
 * quadrado e reduz antes de enviar.
 */
export class CatPhotos {
  private readonly dir: string;
  constructor(dataDir: string) {
    this.dir = join(dataDir, 'cat-photos');
  }

  private file(catId: string) {
    if (!ID_RE.test(catId)) throw badRequest('Gato inválido.');
    return join(this.dir, `${catId}.jpg`);
  }

  /** Versão da foto (para o navegador não usar a antiga), ou null sem foto */
  version(catId: string): number | null {
    try {
      const f = this.file(catId);
      return existsSync(f) ? Math.round(statSync(f).mtimeMs) : null;
    } catch {
      return null;
    }
  }

  async save(catId: string, buf: Buffer) {
    const file = this.file(catId);
    if (buf.length < 500 || buf.length > MAX_BYTES) throw badRequest('A foto precisa ter até 2 MB.');
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw badRequest('Envie a foto em JPEG.');
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, buf);
  }

  async read(catId: string) {
    try {
      return await readFile(this.file(catId));
    } catch {
      throw notFound('Este gato ainda não tem foto.');
    }
  }

  async remove(catId: string) {
    await rm(this.file(catId), { force: true });
  }
}
