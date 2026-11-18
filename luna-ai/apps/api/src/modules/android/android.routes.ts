import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { notFound } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';

/**
 * App Android da Luna (tablet): o APK vem pronto no repositório (apps/android/dist) e é
 * servido aqui para instalar/atualizar pelo próprio tablet, sem Play Store.
 */
/** Login pela tela (cookie) ou pelo próprio app (token, o mesmo da Siri) — para a atualização automática */
async function cookieOrToken(this: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    req.user = await this.services.siri.resolve(req.headers.authorization);
    return;
  }
  return requireAuth(req, reply);
}

export async function androidRoutes(app: FastifyInstance, opts: { distDir: string }) {
  const apk = join(opts.distDir, 'dia.apk');
  const info = () => {
    try {
      return JSON.parse(readFileSync(join(opts.distDir, 'version.json'), 'utf8')) as { versionCode: number; versionName: string; sha256: string };
    } catch {
      return null;
    }
  };

  app.get('/api/android/version', { preHandler: cookieOrToken.bind(app) }, async () => {
    const v = info();
    if (!v || !existsSync(apk)) throw notFound('O app Android ainda não está disponível neste servidor.');
    return { ...v, size: statSync(apk).size };
  });

  const sendApk = (reply: import('fastify').FastifyReply) => {
    if (!existsSync(apk)) throw notFound('O app Android ainda não está disponível neste servidor.');
    return reply
      .header('content-type', 'application/vnd.android.package-archive')
      .header('content-disposition', 'attachment; filename="Luna.apk"')
      .header('content-length', statSync(apk).size)
      .send(createReadStream(apk));
  };
  app.get('/api/android/apk', { preHandler: cookieOrToken.bind(app) }, async (_req, reply) => sendApk(reply));

  /**
   * Instalar na Fire TV / Android TV: o app que baixa lá (Downloader) não tem o login da Luna. Quem está
   * logado gera um endereço curto, fácil de digitar no controle, que baixa o app por 30 minutos.
   */
  const links = new Map<string, number>();
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  app.post('/api/android/download-link', { preHandler: cookieOrToken.bind(app) }, async () => {
    const now = Date.now();
    for (const [k, exp] of links) if (exp < now) links.delete(k);
    const bytes = randomBytes(5);
    const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
    const expiresAt = now + 30 * 60_000;
    links.set(code, expiresAt);
    return { code, path: `/apk/${code}`, expiresAt: new Date(expiresAt).toISOString() };
  });
  app.get('/apk/:code', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const code = String((req.params as { code: string }).code ?? '').toUpperCase();
    const exp = links.get(code);
    if (!exp || exp < Date.now()) throw notFound('Este link de instalação expirou. Gere outro em Ajustes › App Android.');
    return sendApk(reply);
  });
}
