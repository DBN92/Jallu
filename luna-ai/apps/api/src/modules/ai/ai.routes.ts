import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { chatRequestSchema } from '@luna/shared';
import { requireAuth } from '../../middleware/auth';
import { notFound } from '../../lib/errors';
import { safeJson } from '../../lib/text';

const idParam = z.object({ id: z.string().min(1).max(64) });

export async function aiRoutes(app: FastifyInstance) {
  const { chat } = app.services;

  app.post('/api/chat', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) =>
    chat.handle(req.user!, chatRequestSchema.parse(req.body)),
  );

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
