import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';

const params = z.object({ id: z.string().max(40) });

/** Álbum de fotos do descanso de tela: qualquer pessoa da casa com login vê, envia e apaga. */
export async function photosRoutes(app: FastifyInstance) {
  const { photos } = app.services;

  app.get('/api/photos', { preHandler: requireAuth }, async () => photos.list());

  app.get('/api/photos/:id', { preHandler: requireAuth }, async (req, reply) => {
    const buf = await photos.read(params.parse(req.params).id);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=31536000, immutable').send(buf);
  });

  app.post('/api/photos', { preHandler: requireAuth, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(400, 'Nenhuma foto enviada.', 'no_photo');
    await photos.add(await file.toBuffer());
    return photos.list();
  });

  app.delete('/api/photos/:id', { preHandler: requireAuth }, async (req) => {
    await photos.remove(params.parse(req.params).id);
    return photos.list();
  });
}
