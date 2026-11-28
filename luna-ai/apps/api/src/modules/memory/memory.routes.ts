import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { memoryCreateSchema } from '@luna/shared';
import { requireAuth } from '../../middleware/auth';

export async function memoryRoutes(app: FastifyInstance) {
  const { memory } = app.services;
  app.get('/api/memories', { preHandler: requireAuth }, async (req) => memory.list(req.user!.id));
  app.post('/api/memories', { preHandler: requireAuth }, async (req) => {
    const body = memoryCreateSchema.parse(req.body);
    return memory.add(req.user!.id, { ...body, source: 'manual' });
  });
  app.delete('/api/memories/:id', { preHandler: requireAuth }, async (req) => {
    await memory.remove(req.user!.id, z.object({ id: z.string() }).parse(req.params).id);
    return { ok: true };
  });
  app.delete('/api/memories', { preHandler: requireAuth }, async (req) => ({ removed: await memory.clear(req.user!.id) }));
}
