import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { notFound } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';

/**
 * App Android da DIA (tablet): o APK vem pronto no repositório (apps/android/dist) e é
 * servido aqui para instalar/atualizar pelo próprio tablet, sem Play Store.
 */
export async function androidRoutes(app: FastifyInstance, opts: { distDir: string }) {
  const apk = join(opts.distDir, 'dia.apk');
  const info = () => {
    try {
      return JSON.parse(readFileSync(join(opts.distDir, 'version.json'), 'utf8')) as { versionCode: number; versionName: string; sha256: string };
    } catch {
      return null;
    }
  };

  app.get('/api/android/version', { preHandler: requireAuth }, async () => {
    const v = info();
    if (!v || !existsSync(apk)) throw notFound('O app Android ainda não está disponível neste servidor.');
    return { ...v, size: statSync(apk).size };
  });

  app.get('/api/android/apk', { preHandler: requireAuth }, async (_req, reply) => {
    if (!existsSync(apk)) throw notFound('O app Android ainda não está disponível neste servidor.');
    return reply
      .header('content-type', 'application/vnd.android.package-archive')
      .header('content-disposition', 'attachment; filename="DIA.apk"')
      .header('content-length', statSync(apk).size)
      .send(createReadStream(apk));
  });
}
