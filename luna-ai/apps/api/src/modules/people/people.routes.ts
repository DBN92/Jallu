import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const cfgBody = z.object({
  arriveLight: z.string().regex(/^light\.[a-z0-9_]+$/).nullable().optional(),
  leaveLightsOff: z.boolean().optional(),
  leaveNotify: z.boolean().optional(),
});

/** Quem está em casa (pessoas do Home Assistant) e o que fazer ao chegar/sair. */
export async function peopleRoutes(app: FastifyInstance) {
  const { people } = app.services;
  app.get('/api/people', { preHandler: requireAuth }, async () => people.list());
  app.get('/api/people/:id/photo', { preHandler: requireAuth }, async (req, reply) => {
    const res = await people.photo((req.params as { id: string }).id);
    return reply.header('content-type', res.headers.get('content-type') ?? 'image/jpeg').header('cache-control', 'private, max-age=3600').send(Buffer.from(await res.arrayBuffer()));
  });
  app.get('/api/people/config', { preHandler: requireAuth }, async () => people.config());
  app.put('/api/people/config', { preHandler: requireAdmin }, async (req) => people.setConfig(cfgBody.parse(req.body)));
}
