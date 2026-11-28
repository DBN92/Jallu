import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';
import { timeReply } from '../src/modules/ai/chat.service';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('hora e clima com a voz pronta antes da pergunta', () => {
  it('só prepara com uso recente; a frase da hora é a mesma que a resposta e a do minuto seguinte sai antes', async () => {
    ctx = await makeApp();
    const spoken: string[] = [];
    const speak = async (t: string) => void spoken.push(t);
    const siri = ctx.app.services.siri;
    await siri.prewarmTick(speak, () => true, 'America/Sao_Paulo');
    expect(spoken).toEqual([]); // ninguém usou a voz ainda

    const token = (await ctx.inject('POST', '/api/siri/tokens', { name: 'Tablet' })).json.token as string;
    await ctx.inject('PUT', '/api/location/home', { name: 'Casa', latitude: -23.55, longitude: -46.63 });
    const ask = (t: string) => ctx.app.inject({ method: 'POST', url: '/api/siri/ask', payload: { texto: t }, headers: { authorization: `Bearer ${token}` } });
    const hora = (await ask('que horas são')).body;

    const minute = Math.floor(Date.now() / 60_000) * 60_000;
    await siri.prewarmTick(speak, () => true, 'America/Sao_Paulo', minute + 40_000);
    expect(spoken).toContain(timeReply(new Date(minute), 'America/Sao_Paulo'));
    expect(spoken).toContain(timeReply(new Date(minute + 60_000), 'America/Sao_Paulo')); // o minuto seguinte, antes de virar
    expect(hora).toBe(timeReply(new Date(), 'America/Sao_Paulo'));
    // clima de agora, hoje e amanhã — as mesmas frases que a Luna responde
    const clima = (await ask('como está o tempo agora')).body;
    expect(spoken).toContain(clima);
    expect(spoken.length).toBe(5);
  });

  it('a voz da resposta começa a ser gerada assim que a resposta sai', async () => {
    ctx = await makeApp();
    const started: string[] = [];
    ctx.app.services.siri.onAnswer = (t) => started.push(t);
    const token = (await ctx.inject('POST', '/api/siri/tokens', { name: 'Tablet' })).json.token as string;
    const r = await ctx.app.inject({ method: 'POST', url: '/api/siri/ask', payload: { texto: 'que horas são' }, headers: { authorization: `Bearer ${token}` } });
    expect(started).toEqual([r.body]);
  });

  it('o app manda o pedido gravado para transcrever com o token dele (respeita a permissão de transcrição na nuvem)', async () => {
    ctx = await makeApp();
    const token = (await ctx.inject('POST', '/api/siri/tokens', { name: 'Tablet' })).json.token as string;
    const send = (auth: string) => ctx.app.inject({ method: 'POST', url: '/api/voice/transcribe', headers: { authorization: auth } });
    expect((await send('Bearer luna_token_inventado')).statusCode).toBe(401);
    const r = await send(`Bearer ${token}`);
    expect(r.statusCode).toBe(403); // desligada por padrão: o app usa o reconhecimento do tablet
    expect(r.json().message).toMatch(/transcrição na nuvem/);
  });
});
