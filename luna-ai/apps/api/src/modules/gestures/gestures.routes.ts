import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GESTURES } from '@luna/shared';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const body = z.object({
  gesture: z.enum(GESTURES),
  source: z.string().regex(/^(device|camera\.[a-z0-9_]+)$/),
  action: z.enum(['turn_on', 'turn_off', 'toggle']),
  target: z.string().regex(/^(all_lights|[a-z_]+\.[a-z0-9_]+)$/),
  enabled: z.boolean().optional(),
});
const idParam = z.object({ id: z.string().regex(/^[a-z0-9]{8,40}$/) });

export async function gestureRoutes(app: FastifyInstance) {
  const { gestures } = app.services;

  app.get('/api/gestures', { preHandler: requireAuth }, async () => ({ rules: await gestures.list(), sources: await gestures.sources() }));
  app.post('/api/gestures', { preHandler: requireAdmin }, async (req) => gestures.create(body.parse(req.body)));
  app.patch('/api/gestures/:id', { preHandler: requireAdmin }, async (req) => gestures.update(idParam.parse(req.params).id, body.partial().parse(req.body)));
  app.delete('/api/gestures/:id', { preHandler: requireAdmin }, async (req) => gestures.remove(idParam.parse(req.params).id));

  // Disparado pelo aparelho que reconheceu o gesto
  app.post('/api/gestures/fire', { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const b = z.object({ gesture: z.enum(GESTURES), source: body.shape.source }).parse(req.body);
    return gestures.fire(b.gesture, b.source, req.user!.id);
  });
}
