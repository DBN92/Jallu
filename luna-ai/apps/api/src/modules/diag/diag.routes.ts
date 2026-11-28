import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { appendFile, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../middleware/auth';

const body = z.object({
  source: z.enum(['web', 'app']),
  device: z.string().max(60).optional(),
  events: z.array(z.object({ t: z.number(), msg: z.string().max(400) })).max(100),
});

/**
 * Registro de diagnóstico da tela e do app Android (o que aconteceu, em ordem). Fica em
 * data/diag.log (até ~300 KB) para investigar problemas que só acontecem no tablet.
 */
export async function diagRoutes(app: FastifyInstance) {
  const dataDir = app.env.DATABASE_URL.startsWith('file:') ? join(app.env.DATABASE_URL.slice(5), '..') : '.';
  const file = join(dataDir, 'diag.log');

  async function auth(this: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      req.user = await this.services.siri.resolve(req.headers.authorization);
      return;
    }
    return requireAuth(req, reply);
  }

  app.post('/api/diag', { preHandler: auth.bind(app), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const b = body.parse(req.body);
    const lines = b.events.map((e) => `${new Date(e.t).toISOString()} [${b.source}${b.device ? ` ${b.device}` : ''}] ${e.msg.replace(/\s+/g, ' ')}`).join('\n');
    try {
      if (((await stat(file).catch(() => null))?.size ?? 0) > 300_000) await rename(file, `${file}.1`).catch(() => undefined);
      await appendFile(file, `${lines}\n`);
    } catch {
      /* sem pasta de dados (testes) */
    }
    return { ok: true };
  });

  app.get('/api/diag', { preHandler: requireAdmin }, async (_req, reply) => {
    const text = await readFile(file, 'utf8').catch(() => '');
    return reply.type('text/plain; charset=utf-8').send(text.split('\n').slice(-400).join('\n'));
  });
}
