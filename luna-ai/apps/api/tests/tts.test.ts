import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../src/config/env';
import { cleanForSpeech } from '../src/modules/tts/piper.service';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());
const installed = existsSync(resolve(PROJECT_ROOT, 'runtime', 'piper', 'piper', 'piper'));

describe('Voz da Luna (Piper)', () => {
  it('limpa o texto: sem emojis, marcações e quebras de linha', () => {
    expect(cleanForSpeech('**Pronto!** 💡 A luz\nda sala está acesa.')).toBe('Pronto! A luz da sala está acesa.');
  });

  it.skipIf(!installed)('gera WAV com a voz Dii (cookie ou token do app), repete da memória', async () => {
    ctx = await makeApp();
    expect((await ctx.inject('GET', '/api/tts/status')).json).toEqual({ available: true, voice: 'Dii' });
    const t0 = Date.now();
    const a = await ctx.app.inject({ method: 'GET', url: '/api/tts?text=' + encodeURIComponent('Olá! A roupa está pronta.'), headers: { cookie: ctx.cookies } });
    expect(a.statusCode).toBe(200);
    expect(a.headers['content-type']).toBe('audio/wav');
    expect(a.rawPayload.subarray(0, 4).toString()).toBe('RIFF');
    const first = Date.now() - t0;
    const t1 = Date.now();
    const b = await ctx.app.inject({ method: 'GET', url: '/api/tts?text=' + encodeURIComponent('Olá! A roupa está pronta.'), headers: { cookie: ctx.cookies } });
    expect(b.rawPayload.equals(a.rawPayload)).toBe(true);
    expect(Date.now() - t1).toBeLessThan(first);
    // várias frases ao mesmo tempo voltam cada uma com seu áudio
    const many = await Promise.all(['Um.', 'Dois, três.', 'Quatro, cinco e seis.'].map((t) => ctx.app.inject({ method: 'GET', url: '/api/tts?text=' + encodeURIComponent(t), headers: { cookie: ctx.cookies } })));
    const sizes = many.map((r) => r.rawPayload.length);
    expect(sizes[0]!).toBeLessThan(sizes[1]!);
    expect(sizes[1]!).toBeLessThan(sizes[2]!);
    // sem login: recusado
    expect((await ctx.app.inject({ method: 'GET', url: '/api/tts?text=oi' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/tts?text=oi', headers: { authorization: 'Bearer luna_tokenquenaoexiste1234567' } })).statusCode).toBe(401);
  }, 30_000);
});
