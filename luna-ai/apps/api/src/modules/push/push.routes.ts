import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';

const subBody = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  label: z.string().max(40).nullable().optional(),
});

/** Avisos no celular: chave pública, inscrever/cancelar este aparelho e aviso de teste. */
export async function pushRoutes(app: FastifyInstance) {
  const { push } = app.services;
  app.get('/api/push/key', { preHandler: requireAuth }, async (req) => ({ publicKey: push.publicKey, devices: await push.count(req.user!.id) }));
  app.post('/api/push/subscribe', { preHandler: requireAuth }, async (req) => {
    const b = subBody.parse(req.body);
    return push.subscribe(req.user!.id, b, b.label ?? null);
  });
  app.post('/api/push/unsubscribe', { preHandler: requireAuth }, async (req) => push.unsubscribe(z.object({ endpoint: z.string().max(1000) }).parse(req.body).endpoint));
  app.post('/api/push/test', { preHandler: requireAuth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) =>
    push.broadcast({ title: 'Luna', body: 'Os avisos estão funcionando neste aparelho.', url: '/', tag: 'teste' }, { userId: req.user!.id }),
  );
}
