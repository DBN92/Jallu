import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { washerPrefsSchema } from '@luna/shared';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const params = z.object({ id: z.string().regex(/^[a-z0-9_]+$/, 'máquina inválida') });
const onBody = z.object({ on: z.boolean() });

export async function washerRoutes(app: FastifyInstance) {
  const { washer } = app.services;

  app.get('/api/washer', { preHandler: requireAuth }, async () => washer.list());
  app.get('/api/washer/:id', { preHandler: requireAuth }, async (req) => washer.get(params.parse(req.params).id));

  app.post('/api/washer/:id/power', { preHandler: requireAuth }, async (req) => washer.setPower(params.parse(req.params).id, onBody.parse(req.body).on, { source: 'ui', userId: req.user!.id }));
  // on = começar/continuar, off = pausar
  app.post('/api/washer/:id/run', { preHandler: requireAuth }, async (req) => washer.setRunning(params.parse(req.params).id, onBody.parse(req.body).on, { source: 'ui', userId: req.user!.id }));

  app.patch('/api/washer/:id/prefs', { preHandler: requireAuth }, async (req) => washer.setPrefs(params.parse(req.params).id, washerPrefsSchema.parse(req.body)));

  // Autorizar comandos por voz: só administradores
  app.post('/api/washer/:id/voice', { preHandler: requireAdmin }, async (req) => {
    const { allowed } = z.object({ allowed: z.boolean() }).parse(req.body);
    return washer.setVoice(params.parse(req.params).id, allowed);
  });
}
