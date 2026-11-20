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

  // Assistir: dias, arquivos do dia e o vídeo (com Range para avançar/voltar)
  const cam = z.object({ entityId: z.string().regex(/^camera\.[a-z0-9_]+$/) });
  app.get('/api/recordings/:entityId/days', { preHandler: requireAuth }, async (req) => recordings.days(cam.parse(req.params).entityId));
  app.get('/api/recordings/:entityId/days/:date', { preHandler: requireAuth }, async (req) => {
    const p = cam.extend({ date: z.string().max(10) }).parse(req.params);
    return recordings.files(p.entityId, p.date);
  });
  app.get('/api/recordings/:entityId/days/:date/:file', { preHandler: requireAuth, config: { rateLimit: false } }, async (req, reply) => {
    const p = cam.extend({ date: z.string().max(10), file: z.string().max(20) }).parse(req.params);
    const f = await recordings.open(p.entityId, p.date, p.file, req.headers.range);
    reply
      .code(f.status)
      .header('content-type', 'video/mp4')
      .header('accept-ranges', 'bytes')
      .header('content-length', String(f.end - f.start + 1))
      .header('cache-control', 'private, max-age=60');
    if (f.status === 206) reply.header('content-range', `bytes ${f.start}-${f.end}/${f.size}`);
    if (req.query && (req.query as { baixar?: string }).baixar) reply.header('content-disposition', `attachment; filename="${p.date}_${p.file}"`);
    return reply.send(f.stream);
  });
}
