import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const id = z.object({ id: z.string().regex(/^[a-z0-9]{8,40}$/) });
const unit = z.number().min(0).max(1);
const zone = z.object({ x: unit, y: unit, w: unit, h: unit }).nullable();
const camera = z.string().regex(/^camera\.[a-z0-9_]+$/);

export async function watchRoutes(app: FastifyInstance) {
  const { watches } = app.services;

  app.get('/api/watches', { preHandler: requireAuth }, async () => watches.list());
  app.post('/api/watches', { preHandler: requireAdmin }, async (req) =>
    watches.create(z.object({ kind: z.enum(['car', 'gate', 'motion', 'custom']), cameraId: camera, name: z.string().trim().max(40).optional(), zone: zone.optional() }).parse(req.body)),
  );
  app.patch('/api/watches/:id', { preHandler: requireAdmin }, async (req) =>
    watches.update(
      id.parse(req.params).id,
      z
        .object({
          name: z.string().trim().min(1).max(40),
          zone,
          enabled: z.boolean(),
          lightEntity: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/).nullable(),
          lightMinutes: z.number().int().min(1).max(120),
          alertMinutes: z.number().int().min(1).max(24 * 60).nullable(),
          labelA: z.string().trim().min(1).max(30),
          labelB: z.string().trim().min(1).max(30),
        })
        .partial()
        .parse(req.body),
    ),
  );
  app.delete('/api/watches/:id', { preHandler: requireAdmin }, async (req) => watches.remove(id.parse(req.params).id));
  app.post('/api/watches/:id/refs', { preHandler: requireAdmin, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) =>
    watches.addRef(id.parse(req.params).id, z.object({ state: z.enum(['a', 'b']) }).parse(req.body).state),
  );
  app.delete('/api/watches/refs/:id', { preHandler: requireAdmin }, async (req) => watches.removeRef(id.parse(req.params).id));
  app.get('/api/watches/:id/check', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => watches.check(id.parse(req.params).id));

  app.get('/api/camera-events', { preHandler: requireAuth }, async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), camera: camera.optional() }).parse(req.query);
    return watches.events(q.limit, q.camera);
  });
  app.get('/api/camera-events/:id/photo', { preHandler: requireAuth }, async (req, reply) => {
    const buf = await watches.eventPhoto(id.parse(req.params).id);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=86400').send(buf);
  });
}
