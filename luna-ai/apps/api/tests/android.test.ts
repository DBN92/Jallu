import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('App Android (tablet)', () => {
  it('informa a versão e entrega o APK só para quem está logado', async () => {
    ctx = await makeApp();
    const v = await ctx.inject('GET', '/api/android/version');
    expect(v.status).toBe(200);
    expect(v.json).toMatchObject({ versionCode: expect.any(Number), versionName: expect.any(String), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(v.json.size).toBeGreaterThan(1_000_000);
    const apk = await ctx.app.inject({ method: 'GET', url: '/api/android/apk', headers: { cookie: ctx.cookies } });
    expect(apk.statusCode).toBe(200);
    expect(apk.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(apk.rawPayload.subarray(0, 2).toString()).toBe('PK'); // APK é um zip
    const anon = await ctx.app.inject({ method: 'GET', url: '/api/android/apk' });
    expect(anon.statusCode).toBe(401);
    // O próprio app (atualização automática) usa o token dele, sem cookie
    const token = (await ctx.inject('POST', '/api/siri/tokens', { name: 'Tablet' })).json.token as string;
    const byToken = await ctx.app.inject({ method: 'GET', url: '/api/android/version', headers: { authorization: `Bearer ${token}` } });
    expect(byToken.json().versionCode).toBe(v.json.versionCode);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/android/apk', headers: { authorization: 'Bearer luna_tokeninvalido0000000000000' } })).statusCode).toBe(401);
  });

  it('Fire TV: link curto e temporário para baixar o app sem login (só quem está logado gera)', async () => {
    ctx = await makeApp();
    expect((await ctx.app.inject({ method: 'POST', url: '/api/android/download-link' })).statusCode).toBe(401);
    const link = (await ctx.inject('POST', '/api/android/download-link')).json;
    expect(link.path).toMatch(/^\/apk\/[A-Z2-9]{5}\.apk$/);
    // digitado em minúsculas, com barra no fim ou espaço
    for (const u of [`${link.path.toLowerCase()}/`, link.path.replace(/(\/apk\/\w{2})/, '$1%20'), link.path.replace(/\.apk$/, '')]) expect((await ctx.app.inject({ method: 'GET', url: u })).statusCode, u).toBe(200);
    const r = await ctx.app.inject({ method: 'GET', url: link.path.toLowerCase() }); // digitado em minúsculas no controle
    expect(r.statusCode).toBe(200);
    expect(r.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect((await ctx.app.inject({ method: 'GET', url: '/apk/ZZZZZ' })).statusCode).toBe(404);
    // a Luna reiniciou (ex.: atualização): o link continua valendo
    await ctx.app.close();
    ctx = await makeApp();
    expect((await ctx.app.inject({ method: 'GET', url: link.path })).statusCode).toBe(200);
  });

  it('avisa quando o servidor não tem o APK', async () => {
    ctx = await makeApp({ LUNA_ANDROID_DIST: '/nonexistent' });
    expect((await ctx.inject('GET', '/api/android/version')).status).toBe(404);
  });
});
