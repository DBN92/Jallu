import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

export async function androidRoutes(app: FastifyInstance, opts: { distDir: string; dataDir?: string }) {
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
   * logado gera um endereço curto, fácil de digitar no controle, que baixa o app por 2 horas.
   */
  // Guardados em arquivo: sobrevivem à atualização/reinício da Luna (antes o link “expirava” no reinício)
  const linksFile = join(opts.dataDir ?? '.', 'apk-links.json');
  const readLinks = (): Map<string, number> => {
    try {
      return new Map(Object.entries(JSON.parse(readFileSync(linksFile, 'utf8')) as Record<string, number>));
    } catch {
      return new Map();
    }
  };
  const links = readLinks();
  const saveLinks = () => {
    try {
      writeFileSync(linksFile, JSON.stringify(Object.fromEntries(links)));
    } catch {
      /* sem disco: vale até reiniciar */
    }
  };
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  app.post('/api/android/download-link', { preHandler: cookieOrToken.bind(app) }, async () => {
    const now = Date.now();
    for (const [k, exp] of links) if (exp < now) links.delete(k);
    const bytes = randomBytes(5);
    const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
    const expiresAt = now + 2 * 3600_000; // 2 h: dá tempo de instalar o Downloader e liberar a TV
    links.set(code, expiresAt);
    saveLinks();
    console.warn(`[app na TV] link ${code} gerado (vale até ${new Date(expiresAt).toLocaleTimeString('pt-BR')})`);
    return { code, path: `/apk/${code}`, expiresAt: new Date(expiresAt).toISOString() };
  });
  // Aceita “/apk/K7Q2M”, “/apk/k7q2m/”, com espaço ou hífen — o Downloader e o teclado da TV variam
  app.get('/apk/*', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const raw = String((req.params as { '*': string })['*'] ?? '');
    const code = decodeURIComponent(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const exp = links.get(code);
    const now = Date.now();
    if (!exp || exp < now) {
      const valid = [...links.values()].filter((e) => e >= now).length;
      console.warn(`[app na TV] link “${raw.slice(0, 20)}” ${exp ? 'vencido' : 'desconhecido'} (${valid} link(s) válido(s) agora) · ${req.headers['user-agent']?.slice(0, 60) ?? ''}`);
      throw notFound(exp ? 'Este link de instalação expirou. Gere outro em Ajustes › App Android.' : 'Link de instalação não encontrado. Confira o código ou gere outro em Ajustes › App Android.');
    }
    console.warn(`[app na TV] baixando o app pelo link ${code}`);
    return sendApk(reply);
  });
}
