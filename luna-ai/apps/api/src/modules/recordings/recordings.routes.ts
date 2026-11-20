import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';

/** Gravação das câmeras: ver o estado (qualquer pessoa da casa) e ligar/desligar (administrador) */
export async function recordingsRoutes(app: FastifyInstance) {
  const { recordings } = app.services;
  app.get('/api/recordings', { preHandler: requireAuth }, async () => recordings.status());
  app.put('/api/recordings/:entityId', { preHandler: requireAdmin }, async (req) => {
    const { entityId } = z.object({ entityId: z.string().regex(/^camera\.[a-z0-9_]+$/) }).parse(req.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    return recordings.setEnabled(entityId, enabled);
  });
}
