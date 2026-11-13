import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const jpeg = (n = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7)]);
function upload(buf: Buffer) {
  const b = '----luna';
  const payload = Buffer.concat([Buffer.from(`--${b}\r\ncontent-disposition: form-data; name="photo"; filename="f.jpg"\r\ncontent-type: image/jpeg\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
  return ctx.app.inject({ method: 'POST', url: '/api/photos', payload, headers: { cookie: ctx.cookies, 'x-csrf-token': ctx.csrf, 'content-type': `multipart/form-data; boundary=${b}` } });
}

describe('Álbum de fotos do descanso de tela', () => {
  it('envia, lista, entrega e apaga; recusa o que não é JPEG e quem não tem login', async () => {
    ctx = await makeApp();
    for (const id of (await ctx.inject('GET', '/api/photos')).json as string[]) await ctx.inject('DELETE', `/api/photos/${id}`);
    const r = await upload(jpeg());
    expect(r.statusCode).toBe(200);
    const ids = r.json() as string[];
    expect(ids).toHaveLength(1);
    const img = await ctx.app.inject({ method: 'GET', url: `/api/photos/${ids[0]}`, headers: { cookie: ctx.cookies } });
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.rawPayload.length).toBe(2004);
    expect((await upload(Buffer.alloc(2000, 1))).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/photos' })).statusCode).toBe(401);
    expect((await ctx.inject('GET', '/api/photos/..%2Fluna')).status).toBe(404);
    expect((await ctx.inject('DELETE', `/api/photos/${ids[0]}`)).json).toEqual([]);
  });
});
