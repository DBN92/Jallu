import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PublicUser, UserRole } from '@luna/shared';
import type { Db } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from './password';

export const SESSION_COOKIE = 'luna_session';
export const CSRF_COOKIE = 'luna_csrf';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function toPublicUser(u: { id: string; username: string; displayName: string; role: string }): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role as UserRole };
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(sha256(a));
  const bb = Buffer.from(sha256(b));
  return timingSafeEqual(ab, bb) && a.length === b.length;
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly opts: { setupCode: string; sessionTtlHours: number },
  ) {}

  async needsSetup(): Promise<boolean> {
    return (await this.db.user.count()) === 0;
  }

  async setup(input: { username: string; password: string; displayName: string; setupCode: string }) {
    if (!(await this.needsSetup())) throw new AppError(409, 'A Luna já foi configurada.', 'already_setup');
    if (!this.opts.setupCode || this.opts.setupCode === 'troque-este-codigo') {
      throw new AppError(503, 'Defina LUNA_SETUP_CODE no arquivo .env do servidor antes de criar o administrador.', 'setup_code_missing');
    }
    if (!safeEqual(input.setupCode, this.opts.setupCode)) throw new AppError(403, 'Código de configuração inválido.', 'invalid_setup_code');
    return this.createUser({ ...input, role: 'admin' });
  }

  async createUser(input: { username: string; password: string; displayName: string; role: UserRole }) {
    const username = input.username.toLowerCase();
    if (await this.db.user.findUnique({ where: { username } })) throw new AppError(409, 'Este usuário já existe.', 'user_exists');
    const user = await this.db.user.create({
      data: { username, displayName: input.displayName, role: input.role, passwordHash: await hashPassword(input.password) },
    });
    return toPublicUser(user);
  }

  async login(username: string, password: string, userAgent?: string) {
    const user = await this.db.user.findUnique({ where: { username: username.toLowerCase() } });
    // Sempre calcula um hash para reduzir enumeração por tempo de resposta.
    const ok = user
      ? await verifyPassword(password, user.passwordHash)
      : (await verifyPassword(password, 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'), false);
    if (!user || !ok) throw new AppError(401, 'Usuário ou senha incorretos.', 'invalid_credentials');

    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + this.opts.sessionTtlHours * 3600_000);
    await this.db.session.create({
      data: { tokenHash: sha256(token), csrfToken, userId: user.id, userAgent: userAgent?.slice(0, 200), expiresAt },
    });
    return { token, csrfToken, expiresAt, user: toPublicUser(user) };
  }

  async resolveSession(token: string | undefined) {
    if (!token) return null;
    const session = await this.db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await this.db.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    // Atualiza "visto por último" no máximo a cada 5 minutos
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await this.db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    return { sessionId: session.id, csrfToken: session.csrfToken, user: toPublicUser(session.user) };
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(current, user.passwordHash))) throw new AppError(401, 'Senha atual incorreta.', 'invalid_credentials');
    await this.db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
    await this.db.session.deleteMany({ where: { userId } });
  }
}
