import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';

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

describe('renomear dispositivos na DIA', () => {
  it('renomeia, entende o novo nome e o original, e volta ao original', async () => {
    ctx = await makeApp();
    const r = await ctx.inject('PATCH', '/api/devices/light.luz_do_quarto_casal', { name: 'Abajur da cama' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ name: 'Abajur da cama', originalName: 'Luz do Quarto Casal', renamed: true });
    // o Home Assistant não é alterado
    expect(ctx.ha.states.get('light.luz_do_quarto_casal')!.attributes.friendly_name).toBe('Luz do Quarto Casal');

    const byNew = await chat(ctx, 'acenda o abajur da cama');
    expect(byNew.reply).toMatch(/abajur da cama/i);
    expect(ctx.ha.states.get('light.luz_do_quarto_casal')!.state).toBe('on');
    const byOld = await chat(ctx, 'apague a luz do quarto casal');
    expect(byOld.reply).toMatch(/abajur da cama/i);
    expect(ctx.ha.states.get('light.luz_do_quarto_casal')!.state).toBe('off');

    const list = await ctx.inject('GET', '/api/devices');
    expect(list.json.find((d: { entityId: string }) => d.entityId === 'light.luz_do_quarto_casal').name).toBe('Abajur da cama');

    const reset = await ctx.inject('PATCH', '/api/devices/light.luz_do_quarto_casal', { name: null });
    expect(reset.json).toMatchObject({ name: 'Luz do Quarto Casal', renamed: false });
  });

  it('impede nomes repetidos (a DIA não saberia qual usar)', async () => {
    ctx = await makeApp();
    const r = await ctx.inject('PATCH', '/api/devices/light.luz_da_varanda', { name: 'luz da sala' });
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/Já existe/);
  });

  it('somente administradores renomeiam', async () => {
    ctx = await makeApp();
    await ctx.inject('POST', '/api/users', { username: 'filho', password: 'senha-forte-456', displayName: 'Filho', role: 'member' });
    const login = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'filho', password: 'senha-forte-456' } });
    ctx.cookies = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    ctx.csrf = login.json().csrfToken;
    expect((await ctx.inject('PATCH', '/api/devices/light.luz_da_sala', { name: 'Teste' })).status).toBe(403);
  });
});

describe('mesmo aparelho com duas entidades no HA (ex.: tomada usada como luz)', () => {
  const addCabeceira = (ctx: TestCtx) => {
    ctx.ha.states.set('light.cabeceira_socket_1', { entity_id: 'light.cabeceira_socket_1', state: 'off', attributes: { friendly_name: 'Cabeceira Socket 1', supported_color_modes: ['onoff'] } });
    ctx.ha.states.set('switch.cabeceira', { entity_id: 'switch.cabeceira', state: 'off', attributes: { friendly_name: 'Cabeceira Socket 1', device_class: 'outlet' } });
  };

  it('o nome dado na DIA vence: “ligar a cabeceira” não pergunta qual', async () => {
    ctx = await makeApp();
    addCabeceira(ctx);
    await ctx.inject('GET', '/api/devices?all=1');
    await ctx.inject('PATCH', '/api/devices/light.cabeceira_socket_1', { name: 'Cabeceira' });
    const r = await chat(ctx, 'ligar a cabeceira');
    expect(r.reply).not.toMatch(/mais de um/);
    expect(r.reply).toMatch(/cabeceira/i);
    expect(ctx.ha.states.get('light.cabeceira_socket_1')!.state).toBe('on');
  });

  it('entidades ocultas pelo Home Assistant não aparecem nem confundem a DIA', async () => {
    ctx = await makeApp();
    addCabeceira(ctx);
    ctx.app.services.devices.setHiddenProvider(async () => new Set(['switch.cabeceira']));
    const list = await ctx.inject('GET', '/api/devices?all=1');
    const ids = list.json.map((d: { entityId: string }) => d.entityId);
    expect(ids).toContain('light.cabeceira_socket_1');
    expect(ids).not.toContain('switch.cabeceira');
    const r = await chat(ctx, 'acenda a cabeceira socket 1');
    expect(r.reply).not.toMatch(/mais de um/);
    expect(ctx.ha.states.get('light.cabeceira_socket_1')!.state).toBe('on');
  });
});
