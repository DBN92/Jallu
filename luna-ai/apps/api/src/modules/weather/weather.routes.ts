import type { FastifyInstance } from 'fastify';
import { weatherQuerySchema } from '@luna/shared';
import { requireAuth } from '../../middleware/auth';
import { AppError } from '../../lib/errors';

export async function weatherRoutes(app: FastifyInstance) {
  const { weather, settings } = app.services;
  /** Usa coordenadas da requisição (GPS, efêmeras) ou a localização de casa salva. */
  app.get('/api/weather', { preHandler: requireAuth }, async (req) => {
    const q = weatherQuerySchema.parse(req.query);
    if (q.latitude !== undefined && q.longitude !== undefined) return weather.forecast(q.latitude, q.longitude, null);
    const s = await settings.get(req.user!.id);
    if (!s.homeLocation) throw new AppError(400, 'Permita a localização ou defina a localização de casa em Configurações.', 'location_required');
    return weather.forecast(s.homeLocation.latitude, s.homeLocation.longitude, s.homeLocation.name);
  });
}
