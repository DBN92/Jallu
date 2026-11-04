import type { FastifyInstance } from 'fastify';
import { geocodeQuerySchema, homeLocationSchema, settingsUpdateSchema } from '@luna/shared';
import { requireAuth } from '../../middleware/auth';

export async function settingsRoutes(app: FastifyInstance) {
  const { settings } = app.services;
  app.get('/api/settings', { preHandler: requireAuth }, async (req) => settings.get(req.user!.id));
  app.patch('/api/settings', { preHandler: requireAuth }, async (req) => settings.set(req.user!.id, settingsUpdateSchema.parse(req.body)));
}

export async function locationRoutes(app: FastifyInstance) {
  const { settings, weather } = app.services;
  /** Localização residencial: só é gravada quando o usuário escolhe salvá-la. */
  app.put('/api/location/home', { preHandler: requireAuth }, async (req) => settings.set(req.user!.id, { homeLocation: homeLocationSchema.parse(req.body) }));
  app.delete('/api/location/home', { preHandler: requireAuth }, async (req) => settings.clearHome(req.user!.id));
  app.get('/api/location/search', { preHandler: requireAuth }, async (req) => {
    const { q } = geocodeQuerySchema.parse(req.query);
    return weather.geocode(q);
  });
}
