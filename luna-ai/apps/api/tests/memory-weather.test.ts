import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('memória', () => {
  it('memoriza apenas quando pedido e permite apagar', async () => {
    ctx = await makeApp();
    await chat(ctx, 'Lembre que eu prefiro luz quente à noite');
    let list = await ctx.inject('GET', '/api/memories');
    expect(list.json).toHaveLength(1);
    expect(list.json[0].content).toBe('eu prefiro luz quente à noite');
    await chat(ctx, 'oi');
    list = await ctx.inject('GET', '/api/memories');
    expect(list.json).toHaveLength(1);
    // Memórias entram no prompt do modelo local
    ctx.llm.script = [{ content: 'Você prefere luz quente.' }];
    await chat(ctx, 'o que você sabe sobre mim?');
    const req = ctx.llm.requests.at(-1) as { messages: { content: string }[] };
    expect(req.messages[0]!.content).toContain('luz quente');
    expect((await ctx.inject('DELETE', `/api/memories/${list.json[0].id}`)).status).toBe(200);
    expect((await ctx.inject('GET', '/api/memories')).json).toHaveLength(0);
  });

  it('recusa memorizar dados sensíveis', async () => {
    ctx = await makeApp();
    const r = await chat(ctx, 'Lembre que minha senha do banco é 1234');
    expect(r.reply).toMatch(/não vou memorizar/);
    expect((await ctx.inject('POST', '/api/memories', { content: 'meu CPF é 123.456.789-09' })).status).toBe(422);
    expect((await ctx.inject('GET', '/api/memories')).json).toHaveLength(0);
  });

  it('“esqueça” remove memórias', async () => {
    ctx = await makeApp();
    await chat(ctx, 'Lembre que eu acordo às 6h');
    const r = await chat(ctx, 'Esqueça que eu acordo às 6h');
    expect(r.reply).toMatch(/esqueci/);
    expect((await ctx.inject('GET', '/api/memories')).json).toHaveLength(0);
  });
});

describe('clima e localização', () => {
  it('consulta previsão por coordenadas e usa cache', async () => {
    ctx = await makeApp();
    const r = await ctx.inject('GET', '/api/weather?latitude=-23.5505&longitude=-46.6333');
    expect(r.status).toBe(200);
    expect(r.json.current.condition).toBe('Parcialmente nublado');
    expect(r.json.daily).toHaveLength(7);
    expect(r.json.hourly.length).toBeGreaterThan(0);
    const again = await ctx.inject('GET', '/api/weather?latitude=-23.5505&longitude=-46.6333');
    expect(again.json.cached).toBe(true);
    expect(ctx.weather.calls).toBe(1);
  });

  it('pede localização quando não há GPS nem casa definida', async () => {
    ctx = await makeApp();
    expect((await ctx.inject('GET', '/api/weather')).status).toBe(400);
    const r = await chat(ctx, 'vai chover hoje?');
    expect(r.reply).toMatch(/localização/);
  });

  it('responde sobre chuva e guarda-chuva com GPS autorizado', async () => {
    ctx = await makeApp();
    const loc = { location: { latitude: -23.55, longitude: -46.63 } };
    expect((await chat(ctx, 'vai chover hoje?', loc)).reply).toMatch(/Vai chover: 80%/);
    expect((await chat(ctx, 'preciso levar guarda-chuva?', loc)).reply).toMatch(/^Sim, leve o guarda-chuva/);
  });

  it('salva localização de casa somente quando o usuário define', async () => {
    ctx = await makeApp();
    const found = await ctx.inject('GET', '/api/location/search?q=São Paulo');
    expect(found.json[0].name).toMatch(/São Paulo/);
    await ctx.inject('PUT', '/api/location/home', { name: 'São Paulo', latitude: -23.55, longitude: -46.63 });
    const r = await chat(ctx, 'como está o tempo?');
    expect(r.reply).toMatch(/em São Paulo/);
    const s = await ctx.inject('DELETE', '/api/location/home');
    expect(s.json.homeLocation).toBeNull();
  });

  it('erro compreensível sem internet', async () => {
    ctx = await makeApp();
    ctx.weather.online = false;
    const r = await ctx.inject('GET', '/api/weather?latitude=1&longitude=1');
    expect(r.status).toBe(503);
    expect(r.json.message).toMatch(/internet/);
  });
});
