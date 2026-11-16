import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';

/** Login pela tela (cookie) ou pelo app Android (token, o mesmo da Siri) */
async function cookieOrToken(this: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    req.user = await this.services.siri.resolve(req.headers.authorization);
    return;
  }
  return requireAuth(req, reply);
}

export async function tvRoutes(app: FastifyInstance) {
  const { tvDuck } = app.services;
  app.get('/api/tv', { preHandler: requireAuth }, async () => ({ ...tvDuck.config(), options: await tvDuck.options().catch(() => []) }));
  app.put('/api/tv', { preHandler: requireAdmin }, async (req) => tvDuck.setEntity(z.object({ entityId: z.string().regex(/^media_player\.[a-z0-9_]+$/).nullable() }).parse(req.body).entityId));
  // O app/tela avisa: começou a escutar (on) / terminou a conversa (off)
  app.post('/api/tv/duck', { preHandler: cookieOrToken, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    await (on ? tvDuck.duck() : tvDuck.restore()).catch(() => undefined);
    return { ok: true };
  });
}
