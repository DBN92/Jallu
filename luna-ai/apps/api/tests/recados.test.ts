import { afterEach, describe, expect, it } from 'vitest';
import { parseIntent } from '../src/modules/ai/nlu';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const webm = (n = 4000) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(n, 3)]);
function upload(buf: Buffer) {
  const b = '----luna';
  const payload = Buffer.concat([Buffer.from(`--${b}\r\ncontent-disposition: form-data; name="video"; filename="r.webm"\r\ncontent-type: video/webm\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
  return ctx.app.inject({ method: 'POST', url: '/api/recados', payload, headers: { cookie: ctx.cookies, 'x-csrf-token': ctx.csrf, 'content-type': `multipart/form-data; boundary=${b}` } });
}

describe('Recados em vídeo', () => {
  it('grava, lista, entrega em partes, marca como visto e apaga', async () => {
    ctx = await makeApp();
    for (const r of (await ctx.inject('GET', '/api/recados')).json as { id: string }[]) await ctx.inject('DELETE', `/api/recados/${r.id}`);
    const up = await upload(webm());
    expect(up.statusCode).toBe(200);
    const [rec] = up.json() as { id: string; fromName: string; seen: boolean }[];
    expect(rec).toMatchObject({ seen: false });
    expect(rec!.fromName.length).toBeGreaterThan(0);

    const part = await ctx.app.inject({ method: 'GET', url: `/api/recados/${rec!.id}/video`, headers: { cookie: ctx.cookies, range: 'bytes=0-99' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 0-99/4004');
    expect(part.headers['content-type']).toBe('video/webm');
    expect(part.rawPayload.length).toBe(100);
    const whole = await ctx.app.inject({ method: 'GET', url: `/api/recados/${rec!.id}/video`, headers: { cookie: ctx.cookies } });
    expect(whole.statusCode).toBe(200);
    expect(whole.rawPayload.length).toBe(4004);

    // a voz conta os recados novos e pede para a tela abrir
    const said = await ctx.inject('POST', '/api/chat', { message: 'tem algum recado?' });
    expect(said.json.reply).toMatch(/um recado novo: de .+ às \d\d:\d\d/);
    expect(said.json.actions[0].tool).toBe('show_recados');

    expect(((await ctx.inject('POST', `/api/recados/${rec!.id}/seen`)).json as { seen: boolean }[])[0]!.seen).toBe(true);
    expect(((await ctx.inject('POST', `/api/recados/${rec!.id}/save`)).json as { saved: boolean }[])[0]!.saved).toBe(true);
    expect((await ctx.inject('POST', '/api/chat', { message: 'tem recado?' })).json.reply).toBe('Não há recados novos.');
    expect((await upload(Buffer.alloc(4000, 1))).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/recados' })).statusCode).toBe(401);
    expect((await ctx.inject('DELETE', `/api/recados/${rec!.id}`)).json).toEqual([]);
  });

  it('entende os pedidos por voz', () => {
    expect(parseIntent('Oi Luna, deixa um recado')).toEqual({ type: 'recado', command: 'record' });
    expect(parseIntent('quero gravar um recado')).toEqual({ type: 'recado', command: 'record' });
    expect(parseIntent('tem recado pra mim?')).toEqual({ type: 'recado', command: 'play' });
    expect(parseIntent('alguém deixou recado?')).toEqual({ type: 'recado', command: 'play' });
    expect(parseIntent('mostra os recados')).toEqual({ type: 'recado', command: 'play' });
  });
});
