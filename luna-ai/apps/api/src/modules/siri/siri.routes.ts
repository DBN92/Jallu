import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { AppError } from '../../lib/errors';

export async function siriRoutes(app: FastifyInstance) {
  const { siri } = app.services;

  app.get('/api/siri/tokens', { preHandler: requireAuth }, async (req) => siri.list(req.user!.id));
  app.post('/api/siri/tokens', { preHandler: requireAuth }, async (req) => {
    const { name } = z.object({ name: z.string().max(40).default('iPhone') }).parse(req.body ?? {});
    return siri.create(req.user!.id, name);
  });
  app.delete('/api/siri/tokens/:id', { preHandler: requireAuth }, async (req) => {
    await siri.revoke(req.user!.id, z.object({ id: z.string().min(1).max(40) }).parse(req.params).id);
    return { ok: true };
  });

  /**
   * Chamado pelo app Atalhos do iPhone (Siri). Autentica pelo token (sem cookie, sem CSRF:
   * não é um navegador). Aceita {"texto": "..."} ou {"text": "..."} e responde texto puro,
   * que o atalho entrega para a Siri falar.
   */
  app.post('/api/siri/ask', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    // Erros também em texto: a Siri fala a mensagem em vez de ler um JSON
    try {
      const user = await siri.resolve(req.headers.authorization);
      const body = z.object({ texto: z.string().max(2000).optional(), text: z.string().max(2000).optional() }).parse(req.body ?? {});
      const answer = await siri.ask(user, body.texto ?? body.text ?? '');
      return reply.type('text/plain; charset=utf-8').send(answer);
    } catch (err) {
      const status = err instanceof AppError ? err.statusCode : err instanceof z.ZodError ? 400 : 500;
      const msg = err instanceof AppError ? err.message : status === 400 ? 'Pedido inválido.' : 'A Luna teve um problema para responder agora.';
      if (status === 500) req.log.error({ err }, 'siri ask');
      return reply.code(status).type('text/plain; charset=utf-8').send(msg);
    }
  });
}
