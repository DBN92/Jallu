import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../middleware/auth';
import { notFound } from '../../lib/errors';

const topic = z.enum(['sp', 'mundo', 'tec', 'geral']);
const configSchema = z.object({ sources: z.array(z.string().max(30)).max(20), topics: z.array(topic).max(4) });

/** Notícias do dia (manchetes de RSS) e a escolha de jornais/assuntos nos Ajustes. */
export async function newsRoutes(app: FastifyInstance) {
  const { news } = app.services;
  app.get('/api/news', { preHandler: requireAuth }, async () => news.list());
  app.get('/api/news/image/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().regex(/^[0-9a-f]{16}$/) }).parse(req.params);
    const img = await news.photo(id);
    if (!img) throw notFound('Foto indisponível.');
    return reply.header('content-type', img.type).header('cache-control', 'private, max-age=86400').send(img.body);
  });
  app.put('/api/news/config', { preHandler: requireAdmin }, async (req) => news.saveConfig(configSchema.parse(req.body)));
}
