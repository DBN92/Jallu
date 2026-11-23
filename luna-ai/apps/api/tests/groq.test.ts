import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('Groq como IA na nuvem', () => {
  it('com GROQ_API_KEY: perguntas abertas vão para o Groq (gpt-oss com pouco pensamento) e a saúde mostra “Groq”', async () => {
    ctx = await makeApp({ GROQ_API_KEY: 'gsk_teste', OPENAI_API_KEY: '' });
    await ctx.inject('PATCH', '/api/settings', { aiMode: 'cloud' });
    ctx.llm.script = [{ content: 'Que tal um omelete com legumes? Fica pronto em 10 minutos.' }];
    const r = await chat(ctx, 'me dê uma ideia de jantar rápido');
    expect(r.provider).toBe('openai');
    expect(r.reply).toContain('omelete');
    const req = ctx.llm.requests.at(-1)!;
    expect(req).toMatchObject({ model: 'openai/gpt-oss-20b', reasoning_effort: 'low' });
    expect(ctx.llm.cloudUrls.some((u) => u.startsWith('https://api.groq.com/openai/v1/chat/completions'))).toBe(true);
    expect(ctx.llm.cloudUrls.some((u) => u.includes('api.openai.com'))).toBe(false);
    const health = (await ctx.inject('GET', '/api/health/details')).json;
    expect(health.services.openai).toMatchObject({ configured: true, label: 'Groq', model: 'openai/gpt-oss-20b' });
  });

  it('transcrição da fala pelo Groq (Whisper), sem chave da OpenAI; voz em tempo real continua só com a OpenAI', async () => {
    ctx = await makeApp({ GROQ_API_KEY: 'gsk_teste', OPENAI_API_KEY: '' });
    const caps = (await ctx.inject('GET', '/api/voice/capabilities')).json;
    expect(caps).toMatchObject({ realtime: false, cloudTranscription: true });
    await ctx.inject('PATCH', '/api/settings', { allowCloudTranscription: true });
    const b = '----luna';
    const audio = Buffer.alloc(2000, 1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/voice/transcribe',
      payload: Buffer.concat([Buffer.from(`--${b}\r\ncontent-disposition: form-data; name="audio"; filename="a.webm"\r\ncontent-type: audio/webm\r\n\r\n`), audio, Buffer.from(`\r\n--${b}--\r\n`)]),
      headers: { cookie: ctx.cookies, 'x-csrf-token': ctx.csrf, 'content-type': `multipart/form-data; boundary=${b}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().text).toBe('acende a luz da sala');
    expect(ctx.llm.cloudUrls.at(-1)).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(ctx.llm.requests.at(-1)).toMatchObject({ model: 'whisper-large-v3', language: 'pt' });
  });
});
