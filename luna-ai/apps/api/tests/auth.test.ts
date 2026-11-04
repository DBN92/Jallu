import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('autenticação', () => {
  it('exige o código de configuração para criar o primeiro administrador', async () => {
    ctx = await makeApp({}, { login: false });
    const status = await ctx.inject('GET', '/api/auth/status');
    expect(status.json.needsSetup).toBe(true);
    const bad = await ctx.inject('POST', '/api/auth/setup', { username: 'dan', password: 'senha-forte-123', displayName: 'Dan', setupCode: 'errado' });
    expect(bad.status).toBe(403);
    const ok = await ctx.inject('POST', '/api/auth/setup', { username: 'dan', password: 'senha-forte-123', displayName: 'Dan', setupCode: 'codigo-secreto-123' });
    expect(ok.status).toBe(200);
    expect(ok.json.user.role).toBe('admin');
    const again = await ctx.inject('POST', '/api/auth/setup', { username: 'eve', password: 'senha-forte-123', displayName: 'Eve', setupCode: 'codigo-secreto-123' });
    expect(again.status).toBe(409);
  });

  it('bloqueia rotas sem sessão e aceita login válido', async () => {
    ctx = await makeApp();
    const cookies = ctx.cookies;
    ctx.cookies = '';
    expect((await ctx.inject('GET', '/api/devices')).status).toBe(401);
    const wrong = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'dan', password: 'senha-errada-1' } });
    expect(wrong.statusCode).toBe(401);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'DAN', password: 'senha-forte-123' } });
    expect(res.statusCode).toBe(200);
    const session = res.cookies.find((c) => c.name === 'luna_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Strict');
    ctx.cookies = cookies;
  });

  it('exige token CSRF em requisições que alteram estado', async () => {
    ctx = await makeApp();
    const csrf = ctx.csrf;
    ctx.csrf = 'invalido';
    const r = await ctx.inject('POST', '/api/devices/light.luz_da_sala/turn-on');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('csrf');
    ctx.csrf = csrf;
    expect((await ctx.inject('POST', '/api/devices/light.luz_da_sala/turn-on')).status).toBe(200);
  });

  it('logout invalida a sessão', async () => {
    ctx = await makeApp();
    expect((await ctx.inject('POST', '/api/auth/logout')).status).toBe(200);
    expect((await ctx.inject('GET', '/api/devices')).status).toBe(401);
  });

  it('membros não podem alterar autorizações nem automações', async () => {
    ctx = await makeApp();
    const created = await ctx.inject('POST', '/api/users', { username: 'filho', password: 'senha-forte-456', displayName: 'Filho', role: 'member' });
    expect(created.status).toBe(200);
    const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'filho', password: 'senha-forte-456' } });
    ctx.cookies = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    ctx.csrf = login.json().csrfToken;
    expect((await ctx.inject('PATCH', '/api/devices/switch.aquecedor', { aiAllowed: true })).status).toBe(403);
    expect((await ctx.inject('GET', '/api/action-logs')).status).toBe(403);
    expect((await ctx.inject('GET', '/api/devices')).status).toBe(200);
  });

  it('limita tentativas de login', async () => {
    ctx = await makeApp({}, { login: false });
    let last = 0;
    for (let i = 0; i < 10; i++) {
      last = (await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'x-user', password: 'qualquer-coisa' } })).statusCode;
    }
    expect(last).toBe(429);
  });

  it('limita por IP real do Cloudflare mesmo com tráfego vindo de 127.0.0.1', async () => {
    ctx = await makeApp({}, { login: false });
    const attempt = (ip: string) =>
      ctx.app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.1', headers: { 'cf-connecting-ip': ip }, payload: { username: 'x-user', password: 'qualquer-coisa' } });
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await attempt('203.0.113.7')).statusCode;
    expect(last).toBe(429);
    // Outro cliente atrás do mesmo túnel não é afetado
    expect((await attempt('198.51.100.9')).statusCode).toBe(401);
  });
});
