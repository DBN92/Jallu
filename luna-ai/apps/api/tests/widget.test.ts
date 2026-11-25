import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('Widgets do iPhone', () => {
  it('resumo da casa com a chave do app (Bearer); sem chave, recusa', async () => {
    ctx = await makeApp();
    ctx.ha.states.set('light.luz_da_sala', { ...ctx.ha.states.get('light.luz_da_sala')!, state: 'on' });
    await ctx.app.services.devices.refresh(true);
    const token = (await ctx.inject('POST', '/api/siri/tokens', { name: 'iPhone widgets' })).json.token as string;
    const get = (auth?: string) => ctx.app.inject({ method: 'GET', url: '/api/widget', headers: auth ? { authorization: `Bearer ${auth}` } : {} });
    expect((await get()).statusCode).toBe(401);
    expect((await get('luna_invalida')).statusCode).toBe(401);
    const r = await get(token);
    expect(r.statusCode).toBe(200);
    const w = r.json();
    expect(w.lightsOn).toBeGreaterThanOrEqual(1);
    expect(w).toHaveProperty('shopping.count');
    expect(w).toHaveProperty('peopleHome');
    expect(w).toHaveProperty('baby');
    expect(w).toHaveProperty('litter');
    expect(w).toHaveProperty('washer');
    expect(w).toHaveProperty('recordings');
  });
});
