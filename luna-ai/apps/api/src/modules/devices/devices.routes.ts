import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { brightnessSchema, deviceUpdateSchema } from '@luna/shared';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const params = z.object({ entityId: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/, 'entity_id inválido') });

export async function deviceRoutes(app: FastifyInstance) {
  const { devices, actionLogs } = app.services;

  app.get('/api/devices', { preHandler: requireAuth }, async (req) => {
    const { all } = z.object({ all: z.coerce.boolean().optional() }).parse(req.query);
    return devices.list({ includeHidden: all });
  });

  app.get('/api/devices/:entityId', { preHandler: requireAuth }, async (req) => devices.get(params.parse(req.params).entityId));

  app.post('/api/devices/:entityId/turn-on', { preHandler: requireAuth }, async (req) =>
    devices.turnOn(params.parse(req.params).entityId, { source: 'ui', userId: req.user!.id }),
  );

  app.post('/api/devices/:entityId/turn-off', { preHandler: requireAuth }, async (req) =>
    devices.turnOff(params.parse(req.params).entityId, { source: 'ui', userId: req.user!.id }),
  );

  app.post('/api/devices/:entityId/brightness', { preHandler: requireAuth }, async (req) => {
    const { brightness } = brightnessSchema.parse(req.body);
    return devices.setBrightness(params.parse(req.params).entityId, brightness, { source: 'ui', userId: req.user!.id });
  });

  // Autorização por dispositivo (somente administradores)
  app.patch('/api/devices/:entityId', { preHandler: requireAdmin }, async (req) =>
    devices.update(params.parse(req.params).entityId, deviceUpdateSchema.parse(req.body)),
  );

  app.get('/api/action-logs', { preHandler: requireAdmin }, async () => actionLogs.recent(150));
}
