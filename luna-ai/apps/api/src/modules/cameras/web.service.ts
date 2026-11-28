import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CameraDto, WebCameraDto } from '@luna/shared';
import { badRequest, notFound } from '../../lib/errors';

/**
 * Atalhos para câmeras que só funcionam no site do fabricante (ex.: babá eletrônica Smart Life,
 * que o Home Assistant não suporta). A Luna não vê a imagem: o atalho abre o site no navegador do
 * aparelho, onde o login (QR code do app) fica salvo. Nenhuma senha passa pela Luna.
 */
export class WebCamerasService {
  private file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'web-cameras.json');
  }

  private read(): WebCameraDto[] {
    try {
      const v = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      return Array.isArray(v) ? (v as WebCameraDto[]) : [];
    } catch {
      return [];
    }
  }

  list(): WebCameraDto[] {
    return this.read();
  }

  /** Entram na lista de câmeras (voz, página Câmeras); abrir = ir para o site */
  asCameras(): CameraDto[] {
    return this.read().map((c) => ({ entityId: `camera.web_${c.id}`, name: c.name, state: 'web', available: true, stream: false, ptz: false, platform: 'web', webUrl: c.url }));
  }

  isWeb(entityId: string) {
    return entityId.startsWith('camera.web_');
  }

  static checkUrl(raw: string): string {
    let u: URL;
    try {
      u = new URL(raw.trim());
    } catch {
      throw badRequest('Endereço inválido. Ex.: https://protect-us.ismartlife.me');
    }
    if (u.protocol !== 'https:') throw badRequest('Use um endereço que comece com https://');
    if (u.username || u.password) throw badRequest('Não coloque usuário ou senha no endereço: o login é feito no próprio site.');
    return u.toString();
  }

  create(input: { name: string; url: string }): WebCameraDto {
    const name = input.name.trim().slice(0, 60);
    if (!name) throw badRequest('Dê um nome para a câmera.');
    const list = this.read();
    if (list.length >= 20) throw badRequest('Limite de 20 atalhos.');
    const cam = { id: randomBytes(4).toString('hex'), name, url: WebCamerasService.checkUrl(input.url) };
    writeFileSync(this.file, JSON.stringify([...list, cam], null, 2));
    return cam;
  }

  remove(id: string) {
    const list = this.read();
    if (!list.some((c) => c.id === id)) throw notFound('Atalho não encontrado.');
    writeFileSync(this.file, JSON.stringify(list.filter((c) => c.id !== id), null, 2));
  }
}
