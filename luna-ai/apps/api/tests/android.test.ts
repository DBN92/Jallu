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
  });

  it('avisa quando o servidor não tem o APK', async () => {
    ctx = await makeApp({ LUNA_ANDROID_DIST: '/nonexistent' });
    expect((await ctx.inject('GET', '/api/android/version')).status).toBe(404);
  });
});
