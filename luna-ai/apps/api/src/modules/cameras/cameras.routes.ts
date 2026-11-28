import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ptzSchema } from '@luna/shared';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const idParam = z.object({ entityId: z.string().regex(/^camera\.[a-z0-9_]+$/, 'câmera inválida') });

/** Repassa a resposta do HA em fluxo (sem carregar tudo na memória). */
function pipe(reply: FastifyReply, res: Response, cache = 'no-store') {
  reply.header('Content-Type', res.headers.get('content-type') ?? 'application/octet-stream');
  reply.header('Cache-Control', cache);
  reply.status(res.status);
  return reply.send(res.body ? Readable.fromWeb(res.body as never) : '');
}

export async function cameraRoutes(app: FastifyInstance) {
  const { cameras } = app.services;

  app.get('/api/cameras', { preHandler: requireAuth }, async () => cameras.list());

  app.get('/api/cameras/:entityId/snapshot', { preHandler: requireAuth, config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (req, reply) =>
    pipe(reply, await cameras.snapshot(idParam.parse(req.params).entityId)),
  );

  // ~3 quadros/s por aparelho que analisa gestos
  app.get('/api/cameras/:entityId/gesture-frame', { preHandler: requireAuth, config: { rateLimit: { max: 400, timeWindow: '1 minute' } } }, async (req, reply) =>
    pipe(reply, await cameras.gestureFrame(idParam.parse(req.params).entityId)),
  );

  app.get('/api/cameras/:entityId/mjpeg', { preHandler: requireAuth }, async (req, reply) => {
    const ctrl = new AbortController();
    req.raw.on('close', () => ctrl.abort()); // para o vídeo quando o usuário sai
    return pipe(reply, await cameras.mjpeg(idParam.parse(req.params).entityId, ctrl.signal));
  });

  app.get('/api/cameras/:entityId/diagnose', { preHandler: requireAuth }, async (req) => cameras.diagnose(idParam.parse(req.params).entityId));

  app.post('/api/cameras/:entityId/stream', { preHandler: requireAuth }, async (req) => cameras.startStream(idParam.parse(req.params).entityId));

  // Sem cookie: o próprio token (aleatório, emitido a um usuário logado, expira) autoriza.
  // Players nativos (Safari/iPhone) nem sempre enviam cookies nas requisições de vídeo.
  app.get('/api/cameras/hls/:token/*', { config: { rateLimit: false } }, async (req, reply) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]+$/) }).parse(req.params);
    const path = (req.params as { '*': string })['*'];
    return pipe(reply, await cameras.hls(token, path));
  });

  /* ---------- câmeras diretas (RTSP lido pela Luna) — só administradores ---------- */
  const { directCameras } = app.services;
  const directBody = z.object({
    name: z.string().trim().min(1).max(60),
    url: z.string().trim().min(8).max(500),
    username: z.string().max(100).nullish(),
    password: z.string().max(200).nullish(),
    transport: z.enum(['udp', 'tcp']).default('udp'),
  });
  const directId = z.object({ id: z.string().regex(/^[a-z0-9]{8,40}$/) });

  app.get('/api/cameras/direct', { preHandler: requireAdmin }, async () => ({ ffmpeg: !!directCameras.ffmpegPath(), cameras: await directCameras.listInfo() }));
  app.post('/api/cameras/direct', { preHandler: requireAdmin }, async (req) => directCameras.create(directBody.parse(req.body)));
  app.patch('/api/cameras/direct/:id', { preHandler: requireAdmin }, async (req) => directCameras.update(directId.parse(req.params).id, directBody.partial().parse(req.body)));
  app.delete('/api/cameras/direct/:id', { preHandler: requireAdmin }, async (req) => directCameras.remove(directId.parse(req.params).id));
  app.post('/api/cameras/direct/:id/onvif', { preHandler: requireAdmin, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) =>
    directCameras.detectOnvif(directId.parse(req.params).id, z.object({ port: z.coerce.number().int().min(1).max(65535).optional() }).parse(req.body ?? {}).port),
  );
  app.put('/api/cameras/direct/:id/zone', { preHandler: requireAdmin }, async (req) => {
    const unit = z.number().min(0).max(1);
    const body = z.object({ zone: z.object({ x: unit, y: unit, w: unit, h: unit }).nullable() }).parse(req.body);
    return directCameras.setZone(directId.parse(req.params).id, body.zone);
  });
  app.delete('/api/cameras/direct/:id/onvif', { preHandler: requireAdmin }, async (req) => directCameras.disableOnvif(directId.parse(req.params).id));
  app.post('/api/cameras/direct/test', { preHandler: requireAdmin, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) =>
    directCameras.test(directBody.omit({ name: true }).extend({ id: z.string().regex(/^[a-z0-9]{8,40}$/).optional() }).parse(req.body)),
  );

  // Nuvem Tuya (Smart Life): está configurada? e quais aparelhos a conta tem (para adicionar como câmera direta)
  const { tuya } = app.services;
  app.get('/api/cameras/tuya', { preHandler: requireAdmin, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async () => {
    if (!tuya.configured) return { configured: false, devices: [], error: null };
    try {
      return { configured: true, devices: await tuya.devices(), error: null };
    } catch (e) {
      return { configured: true, devices: [], error: e instanceof Error ? e.message : String(e) };
    }
  });

  /**
   * Diagnóstico (administrador): controles remotos infravermelhos da Tuya (Smart IR), que o Home
   * Assistant não suporta. Lista os controles cadastrados no app Smart Life e os botões de cada um.
   */
  app.get('/api/tuya/ir-info', { preHandler: requireAdmin }, async () => {
    if (!tuya.configured) return { configured: false };
    const safe = <T,>(p: Promise<T>) => p.catch((e: Error) => ({ erro: e.message }));
    const hubs = (await tuya.devices()).filter((d) => d.category === 'wnykq' || /\bir\b|infra|controle|remote/i.test(d.name));
    const out = [];
    for (const h of hubs) {
      const remotes = await safe(tuya.get<{ remote_id: string; remote_name?: string; category_id?: number }[]>(`/v2.0/infrareds/${h.id}/remotes`));
      const detail = [];
      if (Array.isArray(remotes)) {
        for (const r of remotes.slice(0, 15)) detail.push({ ...r, keys: await safe(tuya.get(`/v2.0/infrareds/${h.id}/remotes/${r.remote_id}/keys`)) });
      }
      out.push({ hub: h, remotes: Array.isArray(remotes) ? detail : remotes });
    }
    return { configured: true, at: new Date().toISOString(), hubs: out };
  });

  // Atalhos para câmeras que abrem no site do fabricante (ex.: babá eletrônica Smart Life)
  const { webCameras } = app.services;
  app.get('/api/cameras/web', { preHandler: requireAdmin }, async () => webCameras.list());
  app.post('/api/cameras/web', { preHandler: requireAdmin }, async (req) => webCameras.create(z.object({ name: z.string().min(1).max(60), url: z.string().min(8).max(500) }).parse(req.body)));
  app.delete('/api/cameras/web/:id', { preHandler: requireAdmin }, async (req) => {
    webCameras.remove(z.object({ id: z.string().regex(/^[a-f0-9]{8}$/) }).parse(req.params).id);
    return { ok: true };
  });

  app.post('/api/cameras/:entityId/ptz', { preHandler: requireAuth, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) =>
    cameras.ptz(idParam.parse(req.params).entityId, ptzSchema.parse(req.body).action, req.user!.id),
  );
}
