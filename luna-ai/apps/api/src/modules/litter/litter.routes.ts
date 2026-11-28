import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { litterAutoSchema, litterCatSchema } from '@luna/shared';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { AppError, notFound } from '../../lib/errors';

const boxParams = z.object({ id: z.string().regex(/^[a-z0-9_]+$/, 'caixa inválida') });

export async function litterRoutes(app: FastifyInstance) {
  const { litter, catPhotos } = app.services;
  const catParams = z.object({ catId: z.string().min(1).max(40) });

  // Foto do rosto de cada gato
  app.get('/api/litter/cats/:catId/photo', { preHandler: requireAuth }, async (req, reply) => {
    const buf = await catPhotos.read(catParams.parse(req.params).catId);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=31536000, immutable').send(buf);
  });
  app.post('/api/litter/cats/:catId/photo', { preHandler: requireAuth }, async (req) => {
    const { catId } = catParams.parse(req.params);
    if (!(await litter.hasCat(catId))) throw notFound('Gato não encontrado.');
    const file = await req.file();
    if (!file) throw new AppError(400, 'Nenhuma foto enviada.', 'no_photo');
    await catPhotos.save(catId, await file.toBuffer());
    return litter.list();
  });
  app.delete('/api/litter/cats/:catId/photo', { preHandler: requireAuth }, async (req) => {
    await catPhotos.remove(catParams.parse(req.params).catId);
    return litter.list();
  });

  app.get('/api/litter', { preHandler: requireAuth }, async () => litter.list());
  /**
   * Diagnóstico (administrador): o que a nuvem Tuya sabe da caixa — comandos aceitos, modelo e o estado
   * atual de cada um. Abrindo antes e depois de limpar pelo app Smart Life dá para ver qual comando o app usa.
   */
  app.get('/api/litter/tuya-info', { preHandler: requireAdmin }, async () => {
    const { tuya } = app.services;
    if (!tuya.configured) return { configured: false };
    const boxes = (await tuya.devices()).filter((d) => d.category === 'msp' || /litter|areia|caixa/i.test(d.name));
    const out = [];
    for (const d of boxes) {
      const safe = <T,>(p: Promise<T>) => p.catch((e: Error) => ({ erro: e.message }));
      out.push({ device: d, status: await safe(tuya.status(d.id)), functions: await safe(tuya.functions(d.id)), model: await safe(tuya.model(d.id)) });
    }
    return { configured: true, at: new Date().toISOString(), boxes: out };
  });
  app.get('/api/litter/:id', { preHandler: requireAuth }, async (req) => litter.get(boxParams.parse(req.params).id));

  app.post('/api/litter/:id/clean', { preHandler: requireAuth }, async (req) => litter.clean(boxParams.parse(req.params).id, { source: 'ui', userId: req.user!.id }));

  app.post('/api/litter/:id/auto', { preHandler: requireAuth }, async (req) => {
    const { on, delaySeconds } = litterAutoSchema.parse(req.body);
    return litter.setAuto(boxParams.parse(req.params).id, on, delaySeconds, { source: 'ui', userId: req.user!.id });
  });

  // Autorizar comandos por voz (como “Luna pode controlar” dos outros aparelhos): só administradores
  app.post('/api/litter/:id/voice', { preHandler: requireAdmin }, async (req) => {
    const { allowed } = z.object({ allowed: z.boolean() }).parse(req.body);
    return litter.setVoice(boxParams.parse(req.params).id, allowed);
  });

  app.patch('/api/litter/cats/:catId', { preHandler: requireAuth }, async (req) => {
    const { catId } = z.object({ catId: z.string().min(1).max(40) }).parse(req.params);
    return litter.updateCat(catId, litterCatSchema.parse(req.body));
  });
}
