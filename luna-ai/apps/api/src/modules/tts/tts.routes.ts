import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';

/** Login pela tela (cookie) ou pelo app Android (token, o mesmo da Siri) */
async function authTts(this: FastifyInstance, req: FastifyRequest, reply: import('fastify').FastifyReply) {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    req.user = await this.services.siri.resolve(req.headers.authorization);
    return;
  }
  return requireAuth(req, reply);
}

/** Voz da Luna: transforma uma frase em áudio com o Piper (no próprio servidor). */
export async function ttsRoutes(app: FastifyInstance) {
  const { piper } = app.services;
  app.get('/api/tts/status', { preHandler: requireAuth }, async () => ({ available: piper.available, voice: 'Dii' }));
  app.get('/api/tts', { preHandler: authTts.bind(app), config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { text } = z.object({ text: z.string().min(1).max(600) }).parse(req.query);
    try {
      const wav = await piper.speak(text);
      return reply.header('content-type', 'audio/wav').header('cache-control', 'private, max-age=86400').send(wav);
    } catch (err) {
      throw new AppError(503, (err as Error).message, 'tts_unavailable');
    }
  });
}
