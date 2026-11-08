import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { badRequest, notFound } from '../../lib/errors';
import type { DevicesService } from './devices.service';

const ID_RE = /^vacuum\.[a-z0-9_]+$/;
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Fotos dos aspiradores enviadas pelo usuário (a imagem exata do próprio robô).
 * Ficam em data/device-photos/<entity_id>.jpg — o app reduz e converte para JPEG antes de enviar.
 */
export class VacuumPhotos {
  private readonly dir: string;
  constructor(dataDir: string, private readonly devices: DevicesService) {
    this.dir = join(dataDir, 'device-photos');
  }

  async init() {
    try {
      for (const f of await readdir(this.dir)) {
        const id = f.replace(/\.jpg$/, '');
        if (ID_RE.test(id)) this.devices.setPhoto(id, Math.round((await stat(join(this.dir, f))).mtimeMs));
      }
    } catch {
      /* ainda não há fotos */
    }
  }

  private file(entityId: string) {
    if (!ID_RE.test(entityId)) throw badRequest('Só aspiradores podem ter foto.');
    return join(this.dir, `${entityId}.jpg`);
  }

  async save(entityId: string, buf: Buffer) {
    const file = this.file(entityId);
    await this.devices.get(entityId); // precisa existir no Home Assistant
    if (buf.length < 500 || buf.length > MAX_BYTES) throw badRequest('A foto precisa ter até 3 MB.');
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw badRequest('Envie a foto em JPEG.');
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, buf);
    this.devices.setPhoto(entityId, Date.now());
  }

  async read(entityId: string) {
    try {
      return await readFile(this.file(entityId));
    } catch {
      throw notFound('Este robô ainda não tem foto.');
    }
  }

  async remove(entityId: string) {
    await rm(this.file(entityId), { force: true });
    this.devices.setPhoto(entityId, null);
  }
}
