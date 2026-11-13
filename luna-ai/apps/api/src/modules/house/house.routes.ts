import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HOUSE_AUTOMATIONS, houseLinkSchema, type HouseLinksDto } from '@luna/shared';
import { badRequest } from '../../lib/errors';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const ids = HOUSE_AUTOMATIONS.map((a) => a.id) as [string, ...string[]];
const params = z.object({ id: z.enum(ids) });

/**
 * Maquete 3D da casa. Os comandos das luzes usam as rotas normais de /api/devices; aqui só fica
 * guardado qual entidade real do Home Assistant corresponde a cada luz desenhada.
 */
export async function houseRoutes(app: FastifyInstance) {
  const { db, devices } = app.services;
  const links = async (): Promise<HouseLinksDto> => Object.fromEntries((await db.houseLink.findMany()).filter((l) => ids.includes(l.id)).map((l) => [l.id, l.entityId]));

  app.get('/api/house/links', { preHandler: requireAuth }, async () => links());

  // Só o administrador escolhe o vínculo. A entidade precisa existir de verdade no Home Assistant.
  app.put('/api/house/links/:id', { preHandler: requireAdmin }, async (req) => {
    const { id } = params.parse(req.params);
    const { entityId } = houseLinkSchema.parse(req.body);
    if (entityId) {
      const device = await devices.get(entityId);
      const allowed: readonly string[] = HOUSE_AUTOMATIONS.find((a) => a.id === id)!.domains;
      if (!device.controllable || !allowed.includes(device.domain)) throw badRequest(`${device.name} não serve para este item da maquete.`);
    }
    await db.houseLink.upsert({ where: { id }, create: { id, entityId }, update: { entityId } });
    return links();
  });

  // Volta ao automático (a Luna procura o aparelho com o mesmo nome)
  app.delete('/api/house/links/:id', { preHandler: requireAdmin }, async (req) => {
    await db.houseLink.deleteMany({ where: { id: params.parse(req.params).id } });
    return links();
  });
}
