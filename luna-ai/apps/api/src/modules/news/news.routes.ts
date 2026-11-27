import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../middleware/auth';

const topic = z.enum(['sp', 'mundo', 'tec', 'geral']);
const configSchema = z.object({ sources: z.array(z.string().max(30)).max(20), topics: z.array(topic).max(4) });

/** Notícias do dia (manchetes de RSS) e a escolha de jornais/assuntos nos Ajustes. */
export async function newsRoutes(app: FastifyInstance) {
  const { news } = app.services;
  app.get('/api/news', { preHandler: requireAuth }, async () => news.list());
  app.put('/api/news/config', { preHandler: requireAdmin }, async (req) => news.saveConfig(configSchema.parse(req.body)));
}
