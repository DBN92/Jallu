import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { brightnessSchema, deviceUpdateSchema, vacuumCommandSchema, vacuumExtraSchema } from '@luna/shared';
import { AppError } from '../../lib/errors';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const params = z.object({ entityId: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/, 'entity_id inválido') });

export async function deviceRoutes(app: FastifyInstance) {
  const { devices, actionLogs, vacuumPhotos } = app.services;

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

  app.post('/api/devices/:entityId/vacuum', { preHandler: requireAuth }, async (req) => {
    const { command, fanSpeed } = vacuumCommandSchema.parse(req.body);
    return devices.vacuumCommand(params.parse(req.params).entityId, command, { source: 'ui', userId: req.user!.id }, fanSpeed);
  });

  app.post('/api/devices/:entityId/vacuum/extra', { preHandler: requireAuth }, async (req) => {
    const { id, value } = vacuumExtraSchema.parse(req.body);
    return devices.vacuumExtra(params.parse(req.params).entityId, id, value, { source: 'ui', userId: req.user!.id });
  });

  // Foto do robô (a imagem exata do aparelho do usuário)
  app.get('/api/devices/:entityId/photo', { preHandler: requireAuth }, async (req, reply) => {
    const buf = await vacuumPhotos.read(params.parse(req.params).entityId);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=31536000, immutable').send(buf);
  });
  app.post('/api/devices/:entityId/photo', { preHandler: requireAuth }, async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(400, 'Nenhuma foto enviada.', 'no_photo');
    const id = params.parse(req.params).entityId;
    await vacuumPhotos.save(id, await file.toBuffer());
    return devices.get(id);
  });
  app.delete('/api/devices/:entityId/photo', { preHandler: requireAuth }, async (req) => {
    const id = params.parse(req.params).entityId;
    await vacuumPhotos.remove(id);
    return devices.get(id);
  });

  // Autorização por dispositivo (somente administradores)
  app.patch('/api/devices/:entityId', { preHandler: requireAdmin }, async (req) =>
    devices.update(params.parse(req.params).entityId, deviceUpdateSchema.parse(req.body)),
  );

  app.get('/api/action-logs', { preHandler: requireAdmin }, async () => actionLogs.recent(150));
}
