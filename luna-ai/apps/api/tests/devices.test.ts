import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('API de dispositivos (Home Assistant)', () => {
  it('descobre entidades reais e categoriza', async () => {
    ctx = await makeApp();
    const r = await ctx.inject('GET', '/api/devices');
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.json.map((d: { entityId: string }) => [d.entityId, d]));
    expect(byId['light.luz_da_sala'].category).toBe('lighting');
    expect(byId['switch.tomada_cafeteira'].category).toBe('outlets');
    expect(byId['switch.aquecedor'].category).toBe('switches');
    expect(byId['sensor.temperatura_quarto'].category).toBe('sensors');
    expect(byId['climate.ar_condicionado'].category).toBe('climate');
    expect(byId['person.dan']).toBeUndefined();
    // Auto-autorização apenas do domínio configurado (light)
    expect(byId['light.luz_da_sala'].aiAllowed).toBe(true);
    expect(byId['switch.aquecedor'].aiAllowed).toBe(false);
  });

  it('liga, desliga e ajusta brilho confirmando o estado real', async () => {
    ctx = await makeApp();
    const on = await ctx.inject('POST', '/api/devices/light.luz_da_sala/turn-on');
    expect(on.json.isOn).toBe(true);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.luz_da_sala' } });
    const b = await ctx.inject('POST', '/api/devices/light.luz_da_sala/brightness', { brightness: 40 });
    expect(b.json.brightness).toBe(40);
    const off = await ctx.inject('POST', '/api/devices/light.luz_da_sala/turn-off');
    expect(off.json.isOn).toBe(false);
    const single = await ctx.inject('GET', '/api/devices/light.luz_da_sala');
    expect(single.json.state).toBe('off');
  });

  it('valida entradas e impede controlar sensores', async () => {
    ctx = await makeApp();
    expect((await ctx.inject('POST', '/api/devices/rm -rf/turn-on')).status).toBe(400);
    expect((await ctx.inject('POST', '/api/devices/light.inexistente/turn-on')).status).toBe(404);
    expect((await ctx.inject('POST', '/api/devices/sensor.temperatura_quarto/turn-on')).status).toBe(403);
    expect((await ctx.inject('POST', '/api/devices/light.luz_da_sala/brightness', { brightness: 300 })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/devices/light.luz_da_varanda/brightness', { brightness: 50 })).status).toBe(400);
  });

  it('retorna erro compreensível quando o Home Assistant está offline', async () => {
    ctx = await makeApp();
    ctx.ha.online = false;
    const r = await ctx.inject('GET', '/api/devices');
    expect(r.status).toBe(503);
    expect(r.json.message).toMatch(/Home Assistant/);
  });

  it('registra logs de execução e permite autorizar dispositivos', async () => {
    ctx = await makeApp();
    await ctx.inject('POST', '/api/devices/switch.aquecedor/turn-on');
    const logs = await ctx.inject('GET', '/api/action-logs');
    expect(logs.json[0]).toMatchObject({ source: 'ui', tool: 'turn_on', target: 'switch.aquecedor', success: true });
    const patched = await ctx.inject('PATCH', '/api/devices/switch.aquecedor', { aiAllowed: true, aliases: ['aquecedor do escritório'] });
    expect(patched.json.aiAllowed).toBe(true);
    expect(patched.json.aliases).toEqual(['aquecedor do escritório']);
    expect((await ctx.inject('PATCH', '/api/devices/sensor.temperatura_quarto', { aiAllowed: true })).status).toBe(400);
  });
});
