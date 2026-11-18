import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cookieOrToken, requireAdmin, requireAuth } from '../../middleware/auth';

const step = z.object({ target: z.string().min(1).max(120), on: z.boolean(), brightness: z.number().int().min(1).max(100).optional() });
const scene = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(40),
  icon: z.enum(['film', 'moon', 'sun', 'off', 'bed', 'spark']),
  hint: z.string().trim().max(80),
  steps: z.array(step).min(1).max(30),
});

export async function tvRoutes(app: FastifyInstance) {
  const { tvDuck, tvPanel } = app.services;
  // Painel da TV: cenas rápidas e luzes do Início
  app.get('/api/tv/panel', { preHandler: requireAuth }, async () => tvPanel.get());
  app.put('/api/tv/panel', { preHandler: requireAdmin }, async (req) =>
    tvPanel.save(z.object({ scenes: z.array(scene).max(12).nullable().optional(), favorites: z.array(z.string().max(120)).max(12).nullable().optional() }).parse(req.body)),
  );
  app.post('/api/tv/scene/:id', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) =>
    tvPanel.run(z.object({ id: z.string().max(40) }).parse(req.params).id, { source: 'ui', userId: req.user!.id }),
  );
  app.get('/api/tv', { preHandler: requireAuth }, async () => ({ ...tvDuck.config(), options: await tvDuck.options().catch(() => []) }));
  app.put('/api/tv', { preHandler: requireAdmin }, async (req) => tvDuck.setEntity(z.object({ entityId: z.string().regex(/^media_player\.[a-z0-9_]+$/).nullable() }).parse(req.body).entityId));
  // O app/tela avisa: começou a escutar (on) / terminou a conversa (off)
  app.post('/api/tv/duck', { preHandler: cookieOrToken, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    await (on ? tvDuck.duck() : tvDuck.restore()).catch(() => undefined);
    return { ok: true };
  });
}
