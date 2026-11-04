import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PublicUser } from '@luna/shared';
import { AppError, forbidden } from '../lib/errors';
import { SESSION_COOKIE, safeEqual } from '../modules/auth/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    user: PublicUser | null;
    sessionCsrf: string | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Exige sessão válida e, para métodos que alteram estado, o token CSRF (double submit). */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const session = await request.server.services.auth.resolveSession(request.cookies[SESSION_COOKIE]);
  if (!session) throw new AppError(401, 'Sua sessão expirou. Entre novamente.', 'unauthenticated');
  request.user = session.user;
  request.sessionCsrf = session.csrfToken;
  if (!SAFE_METHODS.has(request.method)) {
    const header = request.headers['x-csrf-token'];
    if (typeof header !== 'string' || !safeEqual(header, session.csrfToken)) {
      throw new AppError(403, 'Token CSRF inválido. Recarregue a página.', 'csrf');
    }
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (request.user?.role !== 'admin') throw forbidden('Somente administradores podem fazer isso.');
}
