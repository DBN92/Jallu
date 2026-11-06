import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { chatRequestSchema } from '@luna/shared';
import { requireAuth } from '../../middleware/auth';
import { AppError, notFound } from '../../lib/errors';
import { safeJson } from '../../lib/text';

const idParam = z.object({ id: z.string().min(1).max(64) });

export async function aiRoutes(app: FastifyInstance) {
  const { chat } = app.services;

  app.post('/api/chat', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) =>
    chat.handle(req.user!, chatRequestSchema.parse(req.body)),
  );

  /**
   * Mesma conversa, mas em fluxo (Server-Sent Events): eventos “delta” com o texto sendo gerado
   * e “done” com a resposta completa. A voz começa a falar a 1ª frase sem esperar o fim.
   */
  app.post('/api/chat/stream', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = chatRequestSchema.parse(req.body);
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Mantém a conexão viva durante gerações lentas (proxies/Cloudflare)
    const ping = setInterval(() => raw.write(': ping\n\n'), 15_000);
    try {
      const res = await chat.handle(req.user!, body, (text) => send('delta', { text }));
      send('done', res);
    } catch (err) {
      send('error', { message: err instanceof AppError ? err.message : 'Erro interno no servidor da DIA.' });
      if (!(err instanceof AppError)) req.log.error(err);
    } finally {
      clearInterval(ping);
      raw.end();
    }
  });

  app.get('/api/conversations', { preHandler: requireAuth }, async (req) => {
    const rows = await app.db.conversation.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    });
    return rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString(), messageCount: c._count.messages }));
  });

  app.get('/api/conversations/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = idParam.parse(req.params);
    const conv = await app.db.conversation.findFirst({ where: { id, userId: req.user!.id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!conv) throw notFound('Conversa não encontrada.');
    return {
      id: conv.id,
      title: conv.title,
      summary: conv.summary,
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        provider: m.provider,
        channel: m.channel,
        createdAt: m.createdAt.toISOString(),
        actions: safeJson<{ actions?: unknown[] }>(m.meta, {}).actions ?? [],
      })),
    };
  });

  app.patch('/api/conversations/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { title } = z.object({ title: z.string().trim().min(1).max(80) }).parse(req.body);
    const r = await app.db.conversation.updateMany({ where: { id, userId: req.user!.id }, data: { title } });
    if (!r.count) throw notFound('Conversa não encontrada.');
    return { ok: true };
  });

  app.delete('/api/conversations/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await app.db.conversation.deleteMany({ where: { id, userId: req.user!.id } });
    if (!r.count) throw notFound('Conversa não encontrada.');
    return { ok: true };
  });

  app.post('/api/conversations/:id/summarize', { preHandler: requireAuth }, async (req) => chat.summarize(req.user!, idParam.parse(req.params).id));
}
