import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const keys = { p256dh: 'BOr7xYz0123456789abcdefghij', auth: 'abcdefgh12345' };
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(3000, 3)]);
function upload(headers: Record<string, string> = {}) {
  const b = '----luna';
  const payload = Buffer.concat([Buffer.from(`--${b}\r\ncontent-disposition: form-data; name="video"; filename="r.webm"\r\ncontent-type: video/webm\r\n\r\n`), webm, Buffer.from(`\r\n--${b}--\r\n`)]);
  return ctx.app.inject({ method: 'POST', url: '/api/recados', payload, headers: { cookie: ctx.cookies, 'x-csrf-token': ctx.csrf, 'content-type': `multipart/form-data; boundary=${b}`, ...headers } });
}

describe('Avisos no celular (push)', () => {
  it('inscreve aparelhos e avisa recado novo em todos, menos no que gravou; apaga inscrição vencida', async () => {
    ctx = await makeApp();
    for (const r of (await ctx.inject('GET', '/api/recados')).json as { id: string }[]) await ctx.inject('DELETE', `/api/recados/${r.id}`);
    const key = (await ctx.inject('GET', '/api/push/key')).json;
    expect(key.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    const iphone = 'https://web.push.apple.com/QGabc123';
    const tablet = 'https://fcm.googleapis.com/fcm/send/xyz';
    const velho = 'https://fcm.googleapis.com/fcm/send/vencido';
    for (const endpoint of [iphone, tablet, velho]) expect((await ctx.inject('POST', '/api/push/subscribe', { endpoint, keys, label: 'iPhone' })).json).toEqual({ ok: true });
    // endereço que não é de serviço de push é recusado
    expect((await ctx.inject('POST', '/api/push/subscribe', { endpoint: 'https://evil.example.com/x', keys })).status).toBe(400);
    expect((await ctx.inject('GET', '/api/push/key')).json.devices).toBe(3);

    expect((await upload({ 'x-push-endpoint': tablet })).statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.pushed.map((p) => p.endpoint)).toEqual([iphone]);
    expect(ctx.pushed[0]!.payload).toMatchObject({ title: 'Recado novo', url: expect.stringMatching(/^\/\?recado=[a-f0-9]{16}$/) });
    expect(ctx.pushed[0]!.payload.body).toMatch(/deixou um recado em vídeo/);
    // a inscrição vencida (410) foi apagada
    expect((await ctx.inject('GET', '/api/push/key')).json.devices).toBe(2);

    expect((await ctx.inject('POST', '/api/push/unsubscribe', { endpoint: iphone })).json).toEqual({ ok: true });
    expect((await ctx.inject('POST', '/api/push/test')).json).toEqual({ sent: 1, errors: [] });
  });
});
