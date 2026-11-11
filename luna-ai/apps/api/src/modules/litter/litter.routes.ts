import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { litterAutoSchema, litterCatSchema } from '@luna/shared';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const boxParams = z.object({ id: z.string().regex(/^[a-z0-9_]+$/, 'caixa inválida') });

export async function litterRoutes(app: FastifyInstance) {
  const { litter } = app.services;

  app.get('/api/litter', { preHandler: requireAuth }, async () => litter.list());
  app.get('/api/litter/:id', { preHandler: requireAuth }, async (req) => litter.get(boxParams.parse(req.params).id));

  app.post('/api/litter/:id/clean', { preHandler: requireAuth }, async (req) => litter.clean(boxParams.parse(req.params).id, { source: 'ui', userId: req.user!.id }));

  app.post('/api/litter/:id/auto', { preHandler: requireAuth }, async (req) => {
    const { on, delaySeconds } = litterAutoSchema.parse(req.body);
    return litter.setAuto(boxParams.parse(req.params).id, on, delaySeconds, { source: 'ui', userId: req.user!.id });
  });

  // Autorizar comandos por voz (como “DIA pode controlar” dos outros aparelhos): só administradores
  app.post('/api/litter/:id/voice', { preHandler: requireAdmin }, async (req) => {
    const { allowed } = z.object({ allowed: z.boolean() }).parse(req.body);
    return litter.setVoice(boxParams.parse(req.params).id, allowed);
  });

  app.patch('/api/litter/cats/:catId', { preHandler: requireAuth }, async (req) => {
    const { catId } = z.object({ catId: z.string().min(1).max(40) }).parse(req.params);
    return litter.updateCat(catId, litterCatSchema.parse(req.body));
  });
}
