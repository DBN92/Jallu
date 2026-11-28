import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const idParam = z.object({ id: z.string().min(1).max(64) });

export async function automationRoutes(app: FastifyInstance) {
  const { automations } = app.services;

  app.get('/api/automations', { preHandler: requireAuth }, async () => automations.list());
  app.get('/api/automations/persons', { preHandler: requireAuth }, async () => automations.persons());
  app.post('/api/automations', { preHandler: requireAdmin }, async (req) => automations.createDraft(req.body, req.user!.id));
  // Confirmação explícita: só aqui a regra é criada no Home Assistant
  app.post('/api/automations/:id/activate', { preHandler: requireAdmin }, async (req) => automations.activate(idParam.parse(req.params).id, req.user!.id));
  app.post('/api/automations/:id/enable', { preHandler: requireAdmin }, async (req) => automations.setEnabled(idParam.parse(req.params).id, true, req.user!.id));
  app.post('/api/automations/:id/disable', { preHandler: requireAdmin }, async (req) => automations.setEnabled(idParam.parse(req.params).id, false, req.user!.id));
  app.delete('/api/automations/:id', { preHandler: requireAdmin }, async (req) => {
    await automations.remove(idParam.parse(req.params).id, req.user!.id);
    return { ok: true };
  });
}
