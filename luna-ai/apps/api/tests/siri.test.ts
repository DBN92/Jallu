import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';
import { forSpeech } from '../src/modules/siri/siri.service';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

/** Chamada como o app Atalhos faz: só o token no cabeçalho, sem cookie nem CSRF. */
const ask = (token: string | null, body: unknown) =>
  ctx.app.inject({ method: 'POST', url: '/api/siri/ask', payload: body as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('Siri e app Atalhos', () => {
  it('cria token, executa comandos e responde em texto para a Siri falar', async () => {
    ctx = await makeApp();
    const created = await ctx.inject('POST', '/api/siri/tokens', { name: 'iPhone do Daniel' });
    expect(created.status).toBe(200);
    const token = created.json.token as string;
    expect(token).toMatch(/^dia_[A-Za-z0-9_-]{40,}$/);
    // O token não volta mais: a lista só mostra o começo
    const list = (await ctx.inject('GET', '/api/siri/tokens')).json;
    expect(list).toEqual([expect.objectContaining({ name: 'iPhone do Daniel', prefix: token.slice(0, 10), lastUsedAt: null })]);
    expect(JSON.stringify(list)).not.toContain(token);

    const r = await ask(token, { texto: 'acende a luz da sala' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/plain');
    expect(r.body).toMatch(/luz da sala/i);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.luz_da_sala' } });
    expect((await ctx.inject('GET', '/api/siri/tokens')).json[0].lastUsedAt).not.toBeNull();
  });

  it('continua a conversa para responder “qual?”', async () => {
    ctx = await makeApp();
    const token = (await ctx.inject('POST', '/api/siri/tokens', {})).json.token;
    const q = await ask(token, { texto: 'acende a luz do quarto' });
    expect(q.body).toMatch(/Qual deles/);
    const a = await ask(token, { text: 'a do casal' });
    expect(a.body).toMatch(/Quarto Casal/i);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ data: { entity_id: 'light.luz_do_quarto_casal' } });
  });

  it('recusa sem token, com token apagado, e não aceita cookie de sessão', async () => {
    ctx = await makeApp();
    expect((await ask(null, { texto: 'acende a luz da sala' })).statusCode).toBe(401);
    expect((await ask('dia_tokenfalso1234567890abcdefghij', { texto: 'oi' })).statusCode).toBe(401);
    const created = (await ctx.inject('POST', '/api/siri/tokens', {})).json;
    expect((await ctx.inject('DELETE', `/api/siri/tokens/${created.info.id}`)).status).toBe(200);
    const gone = await ask(created.token, { texto: 'acende a luz da sala' });
    expect(gone.statusCode).toBe(401);
    expect(gone.body).toMatch(/apagado/);
    const cookieOnly = await ctx.app.inject({ method: 'POST', url: '/api/siri/ask', payload: { texto: 'oi' }, headers: { cookie: ctx.cookies } });
    expect(cookieOnly.statusCode).toBe(401);
    expect(ctx.ha.calls).toHaveLength(0);
    // O token só serve para a Siri: não abre o resto da API
    const other = await ctx.app.inject({ method: 'GET', url: '/api/devices', headers: { authorization: `Bearer ${created.token}` } });
    expect(other.statusCode).toBe(401);
  });

  it('limpa o texto para a fala', () => {
    expect(forSpeech('**Pronto!** A DIA acendeu 💡 a `luz`.\n\n- Sala')).toBe('Pronto! A Dia acendeu a luz. - Sala');
  });
});
