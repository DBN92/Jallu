import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';

const params = z.object({ id: z.string().max(40) });

/** Recados em vídeo: qualquer pessoa da casa com login grava, assiste e apaga. */
export async function recadosRoutes(app: FastifyInstance) {
  const { recados } = app.services;

  app.get('/api/recados', { preHandler: requireAuth }, async () => recados.list());

  app.get('/api/recados/:id/video', { preHandler: requireAuth }, async (req, reply) => {
    const v = await recados.video(params.parse(req.params).id, req.headers.range);
    reply.header('content-type', v.mime).header('accept-ranges', 'bytes').header('cache-control', 'private, max-age=604800');
    if (v.partial) {
      if (v.end < 0) return reply.code(416).header('content-range', `bytes */${v.size}`).send();
      reply.code(206).header('content-range', `bytes ${v.start}-${v.end}/${v.size}`);
    }
    return reply.send(v.data);
  });

  app.post('/api/recados', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(400, 'Nenhum vídeo enviado.', 'no_video');
    return recados.add(await file.toBuffer(), req.user!);
  });

  app.post('/api/recados/:id/seen', { preHandler: requireAuth }, async (req) => recados.markSeen(params.parse(req.params).id));
  app.delete('/api/recados/:id', { preHandler: requireAuth }, async (req) => recados.remove(params.parse(req.params).id));
}
