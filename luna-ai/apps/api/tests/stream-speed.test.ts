import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

/** Lê a resposta SSE de /api/chat/stream e separa os eventos. */
async function streamChat(ctx: TestCtx, message: string, extra: Record<string, unknown> = {}) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/chat/stream',
    payload: { message, ...extra },
    headers: { cookie: ctx.cookies, 'x-csrf-token': ctx.csrf },
  });
  expect(res.headers['content-type']).toContain('text/event-stream');
  const events = res.body
    .split('\n\n')
    .filter((b) => b.startsWith('event:'))
    .map((b) => {
      const [ev, data] = b.split('\n');
      return { event: ev!.slice(7), data: JSON.parse(data!.slice(6)) };
    });
  return events;
}

describe('resposta em fluxo (voz começa antes)', () => {
  it('envia pedaços do texto e depois a resposta completa', async () => {
    ctx = await makeApp();
    ctx.llm.script = [{ content: 'Claro! Hoje é um ótimo dia. Posso ajudar em mais alguma coisa?' }];
    const events = await streamChat(ctx, 'conte algo legal');
    const deltas = events.filter((e) => e.event === 'delta').map((e) => e.data.text);
    const done = events.find((e) => e.event === 'done');
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.join('')).toBe('Claro! Hoje é um ótimo dia. Posso ajudar em mais alguma coisa?');
    expect(done!.data.reply).toBe(deltas.join(''));
    expect(done!.data.provider).toBe('ollama');
    expect((ctx.llm.requests[0] as { stream: boolean }).stream).toBe(true);
  });

  it('comandos da casa respondem direto (sem LLM) também no fluxo', async () => {
    ctx = await makeApp();
    const events = await streamChat(ctx, 'acenda a luz da sala');
    const done = events.find((e) => e.event === 'done');
    expect(done!.data.reply).toMatch(/acesa/);
    expect(ctx.llm.requests).toHaveLength(0);
  });

  it('erros chegam como evento legível', async () => {
    ctx = await makeApp({ OPENAI_API_KEY: '' });
    ctx.llm.available = false;
    const events = await streamChat(ctx, 'me conte uma história');
    const done = events.find((e) => e.event === 'done');
    expect(done!.data.reply).toMatch(/Nenhum modelo de IA respondeu/);
  });
});

describe('velocidade do modelo local', () => {
  it('instruções do sistema idênticas entre perguntas (cache do Ollama) e hora no fim', async () => {
    ctx = await makeApp();
    ctx.llm.script = [{ content: 'Oi!' }, { content: 'Tudo bem!' }];
    const r1 = await chat(ctx, 'oi');
    await chat(ctx, 'tudo bem?', { conversationId: r1.conversationId });
    const [a, b] = ctx.llm.requests as { messages: { role: string; content: string }[] }[];
    expect(a!.messages[0]!.content).toBe(b!.messages[0]!.content);
    expect(a!.messages[0]!.content).not.toMatch(/\d{2}:\d{2}/);
    const tail = b!.messages.slice(-2);
    expect(tail[0]!.content).toMatch(/Data e hora atuais/);
    expect(tail[1]).toMatchObject({ role: 'user', content: 'tudo bem?' });
  });

  it('mantém o modelo sempre carregado (keep_alive -1)', async () => {
    ctx = await makeApp();
    ctx.llm.script = [{ content: 'Oi!' }];
    await chat(ctx, 'oi');
    expect((ctx.llm.requests[0] as { keep_alive: unknown }).keep_alive).toBe(-1);
  });

  it('qwen3: desliga o “pensamento” para responder rápido', async () => {
    ctx = await makeApp({ OLLAMA_MODEL: 'qwen3:4b' });
    ctx.llm.script = [{ content: 'Oi!' }];
    // o fake lista qwen2.5:3b; ajusta para o modelo pedido
    const orig = ctx.llm.ollamaFetch;
    ctx.app.services.ollama['fetchImpl' as never] = (async (u: string | URL | Request, init?: RequestInit) => {
      if (String(u).endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3:4b' }] }), { headers: { 'content-type': 'application/json' } });
      return orig(u as string, init);
    }) as never;
    await chat(ctx, 'oi');
    expect((ctx.llm.requests[0] as { think?: boolean }).think).toBe(false);
  });

  it('aquecimento: um único pedido curto, sem ferramentas', async () => {
    ctx = await makeApp();
    expect(await ctx.app.services.chat.warmup()).toBe(true);
    const reqs = ctx.llm.requests as { tools?: unknown[]; options: { num_predict: number } }[];
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.options.num_predict).toBe(1);
    expect(reqs[0]!.tools).toBeUndefined();
  });

  it('pergunta real cancela o aquecimento em andamento (não fica na fila)', async () => {
    ctx = await makeApp();
    let aborted = false;
    const orig = ctx.llm.ollamaFetch;
    ctx.app.services.ollama['fetchImpl' as never] = (async (u: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.options?.num_predict === 1) {
        // aquecimento “lento”: só termina se for abortado
        return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }));
      }
      return orig(u as string, init);
    }) as never;
    const warm = ctx.app.services.chat.warmup();
    await new Promise((r) => setTimeout(r, 30));
    ctx.llm.script = [{ content: 'Oi! Tudo ótimo.' }];
    const r = await chat(ctx, 'oi, tudo bem?');
    expect(aborted).toBe(true);
    expect(r.reply).toBe('Oi! Tudo ótimo.');
    expect(await warm).toBe(true);
  });

  it('instruções iguais para voz e texto (um só cache); estilo de voz vai no fim', async () => {
    ctx = await makeApp();
    ctx.llm.script = [{ content: 'Oi!' }, { content: 'Oi de novo!' }];
    await chat(ctx, 'oi');
    await chat(ctx, 'olá', { channel: 'voice' });
    const [t, v] = ctx.llm.requests as { messages: { role: string; content: string }[] }[];
    expect(t!.messages[0]!.content).toBe(v!.messages[0]!.content);
    expect(v!.messages.at(-2)!.content).toMatch(/veio por VOZ/);
    expect(t!.messages.at(-2)!.content).not.toMatch(/veio por VOZ/);
  });
});

describe('mensagens de erro claras', () => {
  it('diz o motivo real quando o modelo não está instalado', async () => {
    ctx = await makeApp({ OLLAMA_MODEL: 'qwen3:4b', OPENAI_API_KEY: '' });
    await ctx.inject('PATCH', '/api/settings', { aiMode: 'local' });
    const r = await chat(ctx, 'me conte uma curiosidade sobre a lua');
    expect(r.reply).toMatch(/somente local/);
    expect(r.reply).toMatch(/qwen3:4b não está instalado/);
  });

  it('diz o motivo real quando o Ollama está desligado', async () => {
    ctx = await makeApp({ OPENAI_API_KEY: '' });
    ctx.llm.available = false;
    const r = await chat(ctx, 'me conte uma curiosidade sobre a lua');
    expect(r.reply).toMatch(/não está rodando/);
  });
});
