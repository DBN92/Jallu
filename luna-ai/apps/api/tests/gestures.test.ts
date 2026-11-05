import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('comandos por gesto de mão', () => {
  it('cadastra regras, executa a ação certa e respeita o intervalo entre disparos', async () => {
    ctx = await makeApp();
    expect((await ctx.inject('POST', '/api/gestures', { gesture: 'aceno', source: 'device', action: 'turn_on', target: 'light.luz_da_sala' })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/gestures', { gesture: 'open_palm', source: 'device', action: 'turn_on', target: 'light.nao_existe' })).status).toBe(400);

    const on = await ctx.inject('POST', '/api/gestures', { gesture: 'open_palm', source: 'camera.luna_abc12345', action: 'turn_on', target: 'light.luz_da_sala' });
    expect(on.status).toBe(200);
    await ctx.inject('POST', '/api/gestures', { gesture: 'closed_fist', source: 'camera.luna_abc12345', action: 'turn_off', target: 'light.luz_da_sala' });

    const list = await ctx.inject('GET', '/api/gestures');
    expect(list.json.rules).toHaveLength(2);
    expect(list.json.sources).toEqual(['camera.luna_abc12345']);

    // Gesto em outra câmera: nada acontece
    const other = await ctx.inject('POST', '/api/gestures/fire', { gesture: 'open_palm', source: 'device' });
    expect(other.json.results).toEqual([]);

    const fired = await ctx.inject('POST', '/api/gestures/fire', { gesture: 'open_palm', source: 'camera.luna_abc12345' });
    expect(fired.json).toMatchObject({ emoji: '✋', results: [{ ok: true, summary: 'Luz da Sala ligada' }] });
    expect(ctx.ha.states.get('light.luz_da_sala')?.state).toBe('on');

    // Mão ainda aberta logo em seguida: não repete
    const again = await ctx.inject('POST', '/api/gestures/fire', { gesture: 'open_palm', source: 'camera.luna_abc12345' });
    expect(again.json.results).toEqual([]);

    const off = await ctx.inject('POST', '/api/gestures/fire', { gesture: 'closed_fist', source: 'camera.luna_abc12345' });
    expect(off.json.results[0].summary).toBe('Luz da Sala desligada');

    // Registro no histórico com a origem “gesture”
    const logs = await ctx.inject('GET', '/api/action-logs');
    expect(JSON.stringify(logs.json)).toContain('gesture');

    // Regra desativada não dispara
    await ctx.inject('PATCH', `/api/gestures/${on.json.id}`, { enabled: false });
    const disabled = await ctx.inject('POST', '/api/gestures/fire', { gesture: 'open_palm', source: 'camera.luna_abc12345' });
    expect(disabled.json.results).toEqual([]);
    expect((await ctx.inject('DELETE', `/api/gestures/${on.json.id}`)).status).toBe(200);
  });

  it('alternar e “todas as luzes”', async () => {
    ctx = await makeApp();
    await ctx.inject('POST', '/api/gestures', { gesture: 'victory', source: 'device', action: 'toggle', target: 'switch.tomada_cafeteira' });
    await ctx.inject('POST', '/api/gestures', { gesture: 'thumb_up', source: 'device', action: 'turn_on', target: 'all_lights' });
    expect((await ctx.inject('POST', '/api/gestures/fire', { gesture: 'victory', source: 'device' })).json.results[0].summary).toBe('Tomada Cafeteira ligada');
    const all = await ctx.inject('POST', '/api/gestures/fire', { gesture: 'thumb_up', source: 'device' });
    expect(all.json.results[0].summary).toMatch(/Luzes acesas/);
    expect(ctx.ha.states.get('light.luz_da_varanda')?.state).toBe('on');
  });
});
