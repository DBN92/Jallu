import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createUserSchema, loginSchema, setupSchema } from '@luna/shared';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { CSRF_COOKIE, SESSION_COOKIE } from './auth.service';

export async function authRoutes(app: FastifyInstance) {
  const { auth } = app.services;

  const isSecure = (req: FastifyRequest) => {
    const mode = app.env.LUNA_COOKIE_SECURE;
    return mode === 'true' || (mode === 'auto' && req.protocol === 'https');
  };

  const setSessionCookies = (req: FastifyRequest, reply: FastifyReply, token: string, csrf: string, expires: Date) => {
    const common = { path: '/', sameSite: 'strict' as const, secure: isSecure(req), expires };
    reply.setCookie(SESSION_COOKIE, token, { ...common, httpOnly: true });
    reply.setCookie(CSRF_COOKIE, csrf, { ...common, httpOnly: false });
  };

  const loginLimit = { config: { rateLimit: { max: 8, timeWindow: '5 minutes' } } };

  app.get('/api/auth/status', async (req) => {
    const session = await auth.resolveSession(req.cookies[SESSION_COOKIE]);
    return { needsSetup: await auth.needsSetup(), user: session?.user ?? null, csrfToken: session?.csrfToken ?? null };
  });

  app.post('/api/auth/setup', loginLimit, async (req, reply) => {
    const input = setupSchema.parse(req.body);
    await auth.setup(input);
    const s = await auth.login(input.username, input.password, req.headers['user-agent']);
    setSessionCookies(req, reply, s.token, s.csrfToken, s.expiresAt);
    return { user: s.user, csrfToken: s.csrfToken };
  });

  app.post('/api/auth/login', loginLimit, async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const s = await auth.login(input.username, input.password, req.headers['user-agent']);
    setSessionCookies(req, reply, s.token, s.csrfToken, s.expiresAt);
    return { user: s.user, csrfToken: s.csrfToken };
  });

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    await auth.logout(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' }).clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/password', { preHandler: requireAuth, ...loginLimit }, async (req, reply) => {
    const body = z.object({ current: z.string().min(1), next: z.string().min(8).max(200) }).parse(req.body);
    await auth.changePassword(req.user!.id, body.current, body.next);
    reply.clearCookie(SESSION_COOKIE, { path: '/' }).clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/users', { preHandler: requireAdmin }, async () => {
    const users = await app.db.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role }));
  });

  app.post('/api/users', { preHandler: requireAdmin }, async (req) => auth.createUser(createUserSchema.parse(req.body)));

  app.delete('/api/users/:id', { preHandler: requireAdmin }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    if (id === req.user!.id) return { ok: false, error: 'Você não pode remover a si mesmo.' };
    await app.db.user.delete({ where: { id } });
    return { ok: true };
  });
}
