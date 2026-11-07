import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

/** Dois robôs como na casa do usuário: um Xiaomi (bateria em sensor separado) e um Neatsvor via Tuya. */
async function withVacuums() {
  ctx = await makeApp();
  const now = new Date().toISOString();
  ctx.ha.states.set('vacuum.robo_xiaomi', {
    entity_id: 'vacuum.robo_xiaomi',
    state: 'docked',
    attributes: { friendly_name: 'Robô Xiaomi', supported_features: 4 | 8 | 16 | 32 | 512 | 8192, fan_speed: 'Standard', fan_speed_list: ['Silent', 'Standard', 'Medium', 'Turbo'] },
    last_changed: now,
  });
  ctx.ha.states.set('sensor.robo_xiaomi_battery', { entity_id: 'sensor.robo_xiaomi_battery', state: '87', attributes: { friendly_name: 'Robô Xiaomi Bateria', device_class: 'battery', unit_of_measurement: '%' }, last_changed: now });
  ctx.ha.states.set('vacuum.neatsvor', {
    entity_id: 'vacuum.neatsvor',
    state: 'docked',
    attributes: { friendly_name: 'Neatsvor', supported_features: 4 | 16 | 32 | 8192, battery_level: 100, fan_speed: 'normal', fan_speed_list: ['gentle', 'normal', 'strong'] },
    last_changed: now,
  });
  // Autoriza os dois para a DIA (como o usuário faria em “Minha casa”)
  await ctx.inject('GET', '/api/devices?all=1');
  for (const id of ['vacuum.robo_xiaomi', 'vacuum.neatsvor']) expect((await ctx.inject('PATCH', `/api/devices/${id}`, { aiAllowed: true })).status).toBe(200);
}

describe('Aspiradores robôs', () => {
  it('lista os robôs com situação, bateria e recursos', async () => {
    await withVacuums();
    const list = (await ctx.inject('GET', '/api/devices')).json as any[];
    const x = list.find((d) => d.entityId === 'vacuum.robo_xiaomi');
    expect(x).toMatchObject({ category: 'vacuum', controllable: true, isOn: false });
    expect(x.vacuum).toMatchObject({ phase: 'docked', battery: 87, status: 'Carregando na base', can: { locate: true, fanSpeed: true } });
    const n = list.find((d) => d.entityId === 'vacuum.neatsvor');
    expect(n.vacuum).toMatchObject({ battery: 100, status: 'Na base', can: { locate: false, stop: false } });
  });

  it('comandos pela tela usam só serviços permitidos do domínio vacuum', async () => {
    await withVacuums();
    const start = await ctx.inject('POST', '/api/devices/vacuum.robo_xiaomi/vacuum', { command: 'start' });
    expect(start.json.vacuum.phase).toBe('cleaning');
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'vacuum', service: 'start', data: { entity_id: 'vacuum.robo_xiaomi' } });
    const fan = await ctx.inject('POST', '/api/devices/vacuum.robo_xiaomi/vacuum', { command: 'set_fan_speed', fanSpeed: 'turbo' });
    expect(fan.json.vacuum.fanSpeed).toBe('Turbo');
    expect((await ctx.inject('POST', '/api/devices/vacuum.robo_xiaomi/vacuum', { command: 'set_fan_speed', fanSpeed: 'foguete' })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/devices/vacuum.robo_xiaomi/vacuum', { command: 'send_command' })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/devices/vacuum.neatsvor/vacuum', { command: 'locate' })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/devices/light.luz_da_sala/vacuum', { command: 'start' })).status).toBe(400);
    const home = await ctx.inject('POST', '/api/devices/vacuum.robo_xiaomi/vacuum', { command: 'return_to_base' });
    expect(home.json.vacuum.phase).toBe('returning');
    // Liga/desliga genérico (automações, gestos) vira começar/voltar para a base
    await ctx.inject('POST', '/api/devices/vacuum.neatsvor/turn-on');
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'vacuum', service: 'start' });
  });

  it('entende comandos de voz e pergunta qual robô quando há dois', async () => {
    await withVacuums();
    let r = await chat(ctx, 'Oi, Dia, aspira a casa');
    expect(r.reply).toMatch(/Qual robô deve limpar: Neatsvor ou Robô Xiaomi\? Ou os dois\?/);
    r = await chat(ctx, 'os dois', { conversationId: r.conversationId });
    expect(r.reply).toMatch(/Robô Xiaomi começou a aspirar/);
    expect(r.reply).toMatch(/Neatsvor começou a aspirar/);
    r = await chat(ctx, 'pausa o aspirador xiaomi');
    expect(r.reply).toMatch(/Robô Xiaomi pausou/);
    // Só o Neatsvor ainda limpa: “manda o robô pra base” não precisa perguntar
    r = await chat(ctx, 'manda o robô voltar pra base');
    expect(r.reply).toMatch(/Robô Xiaomi está voltando para a base/);
    expect(r.reply).toMatch(/Neatsvor está voltando para a base/);
    r = await chat(ctx, 'como está o aspirador?');
    expect(r.reply).toMatch(/Robô Xiaomi: voltando para a base, bateria em 87%/);
    r = await chat(ctx, 'aspira a sala');
    expect(r.reply).toMatch(/ainda não consigo mandar o robô limpar só sala/);
    r = await chat(ctx, 'onde está o robô xiaomi?');
    expect(r.reply).toMatch(/vai apitar/);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'vacuum', service: 'locate' });
  });

  it('respeita a autorização da DIA e avisa quando não há robô', async () => {
    ctx = await makeApp();
    let r = await chat(ctx, 'aspira a casa');
    expect(r.reply).toMatch(/não encontrei nenhum aspirador/i);
    await ctx.app.close();
    await withVacuums();
    await ctx.inject('PATCH', '/api/devices/vacuum.neatsvor', { aiAllowed: false });
    r = await chat(ctx, 'manda o neatsvor limpar');
    expect(r.reply).toMatch(/não está autorizado/);
    expect(ctx.ha.calls.filter((c) => c.domain === 'vacuum')).toHaveLength(0);
  });

  it('a IA usa a ferramenta control_vacuum com validação', async () => {
    await withVacuums();
    ctx.llm.script.push({ tool: 'control_vacuum', args: { device: 'Neatsvor', command: 'start' } }, { content: 'O Neatsvor começou a limpar.' });
    const r = await chat(ctx, 'quero a casa limpinha antes da visita chegar, dá um jeito');
    expect(r.actions[0]).toMatchObject({ tool: 'vacuum_start', ok: true });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'vacuum', service: 'start', data: { entity_id: 'vacuum.neatsvor' } });
  });
});
