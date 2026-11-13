import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/lib/db';
import { FakeHomeAssistant, FakeLlm, FakeWeather, testDbUrl } from './fakes';

export interface TestCtx {
  app: FastifyInstance;
  ha: FakeHomeAssistant;
  llm: FakeLlm;
  weather: FakeWeather;
  cookies: string;
  csrf: string;
  inject: (method: string, url: string, body?: unknown) => Promise<{ status: number; json: any }>;
}

const db = createDb(testDbUrl());

export async function resetDb() {
  // Ordem respeita chaves estrangeiras
  await db.actionLog.deleteMany();
  await db.directCamera.deleteMany();
  await db.gestureRule.deleteMany();
  await db.visualRef.deleteMany();
  await db.visualWatch.deleteMany();
  await db.cameraEvent.deleteMany();
  await db.automationRule.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.memory.deleteMany();
  await db.preference.deleteMany();
  await db.litterVisit.deleteMany();
  await db.litterCat.deleteMany();
  await db.litterBoxPref.deleteMany();
  await db.houseLink.deleteMany();
  await db.washerCycle.deleteMany();
  await db.washerPref.deleteMany();
  await db.apiToken.deleteMany();
  await db.session.deleteMany();
  await db.device.deleteMany();
  await db.integration.deleteMany();
  await db.user.deleteMany();
}

export async function makeApp(envOverrides: Record<string, string> = {}, opts: { login?: boolean; cameraInput?: import('../src/modules/cameras/direct.service').InputArgs } = { login: true }): Promise<TestCtx> {
  await resetDb();
  const ha = new FakeHomeAssistant();
  const llm = new FakeLlm();
  const weather = new FakeWeather();
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: testDbUrl(),
    LUNA_SETUP_CODE: 'codigo-secreto-123',
    HA_URL: 'http://ha.local:8123',
    HA_TOKEN: 'test-ha-token',
    OLLAMA_URL: 'http://ollama.local:11434',
    OPENAI_API_KEY: 'sk-test-permanent-key',
    LUNA_AI_AUTO_AUTHORIZE_DOMAINS: 'light',
    LUNA_WEB_DIST: '/nonexistent',
    ...envOverrides,
  });
  const app = await buildApp({
    env,
    db: createDb(testDbUrl()),
    fetch: { ha: ha.fetch, ollama: llm.ollamaFetch, openai: llm.openaiFetch, weather: weather.fetch },
    disableHaWs: true,
    cameraInput: opts.cameraInput,
  });
  await app.ready();

  const ctx: TestCtx = {
    app,
    ha,
    llm,
    weather,
    cookies: '',
    csrf: '',
    inject: async (method, url, body) => {
      const res = await app.inject({
        method: method as 'GET',
        url,
        payload: body as object | undefined,
        headers: { cookie: ctx.cookies, 'x-csrf-token': ctx.csrf },
      });
      let parsed: unknown = null;
      try {
        parsed = res.json();
      } catch {
        parsed = res.body;
      }
      return { status: res.statusCode, json: parsed };
    },
  };

  if (opts.login !== false) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'dan', password: 'senha-forte-123', displayName: 'Dan', setupCode: 'codigo-secreto-123' },
    });
    if (res.statusCode !== 200) throw new Error(`setup falhou: ${res.body}`);
    ctx.cookies = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    ctx.csrf = (res.json() as { csrfToken: string }).csrfToken;
  }
  return ctx;
}

export async function chat(ctx: TestCtx, message: string, extra: Record<string, unknown> = {}) {
  const r = await ctx.inject('POST', '/api/chat', { message, ...extra });
  if (r.status !== 200) throw new Error(`chat ${r.status}: ${JSON.stringify(r.json)}`);
  return r.json as { reply: string; conversationId: string; provider: string; actions: { ok: boolean; tool: string; summary: string }[]; notices: string[] };
}
