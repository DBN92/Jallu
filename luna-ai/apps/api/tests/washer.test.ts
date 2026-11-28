import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';
import { parseIntent } from '../src/modules/ai/nlu';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const P = '149533581394056';

/** A lava e seca como aparece no Home Assistant do usuário (Midea AC LAN, tipo DB). */
async function withWasher(status = 'standby') {
  ctx = await makeApp();
  const now = new Date().toISOString();
  const add = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ctx.ha.states.set(entity_id, { entity_id, state, attributes, last_changed: now });
  const n = (k: string) => `Máquina de lavar ${k}`;
  add(`sensor.${P}_dehydration_speed`, 'default', { friendly_name: n('Dehydration speed') });
  add(`sensor.${P}_dehydration_time`, '0', { friendly_name: n('Dehydration time') });
  add(`sensor.${P}_dehydration_time_value`, '0', { friendly_name: n('Dehydration time value'), unit_of_measurement: 'min' });
  add(`sensor.${P}_detergent`, '0', {});
  add(`sensor.${P}_dirty_degree`, '0', {});
  add(`sensor.${P}_mode`, 'normal', {});
  add(`sensor.${P}_program`, '119', { friendly_name: n('Program') });
  add(`sensor.${P}_progress`, 'wash', { friendly_name: n('Progress') });
  add(`sensor.${P}_softener`, '0', {});
  add(`sensor.${P}_stains`, '0', {});
  add(`sensor.${P}_status`, status, { friendly_name: n('Status') });
  add(`sensor.${P}_temperature`, '60', { unit_of_measurement: '°C', device_class: 'temperature' });
  add(`sensor.${P}_time_remaining`, '35', { unit_of_measurement: 'min' });
  add(`sensor.${P}_wash_time`, '0', {});
  add(`sensor.${P}_wash_time_value`, '21', { unit_of_measurement: 'min' });
  add(`sensor.${P}_water_level`, '0', {});
  add(`switch.${P}_power`, 'on', { friendly_name: n('Power') });
  add(`switch.${P}_start`, 'off', { friendly_name: n('Start') });
  clock = Date.parse('2026-11-11T16:00:00Z');
  ctx.app.services.washer.now = () => new Date(clock);
}

let clock = 0;
const advance = (min: number) => (clock += min * 60_000);

/** Simula o Home Assistant avisando uma mudança (como chega pelo WebSocket). */
async function change(key: string, value: string, domain = 'sensor') {
  const entity = `${domain}.${P}_${key}`;
  const old = ctx.ha.states.get(entity)!;
  const next = { ...old, state: value };
  ctx.ha.states.set(entity, next);
  await ctx.app.services.washer.handleStateChanged({ entity_id: entity, old_state: old, new_state: next } as any);
}

describe('Lava e seca (Midea AC LAN)', () => {
  it('aparece como uma máquina só, com o programa e os dados do painel, e some da lista de aparelhos', async () => {
    await withWasher();
    const list = (await ctx.inject('GET', '/api/washer')).json;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: P,
      name: 'Lava e seca',
      available: true,
      power: true,
      statusLabel: 'Pronta para começar',
      running: false,
      remainingMin: 35,
      endsAt: null,
      program: 'Programa 119',
      canPower: true,
      canStart: true,
      weekCycles: 0,
      notifyDone: true,
      speak: true,
    });
    expect(list[0].details).toEqual([
      { label: 'Programa', value: 'Programa 119' },
      { label: 'Temperatura', value: '60 °C' },
      { label: 'Centrifugação', value: 'Padrão' },
      { label: 'Tempo de lavagem', value: '21 min' },
    ]);
    expect(list[0].steps.map((s: any) => s.label)).toEqual(['Lavar', 'Enxaguar', 'Centrifugar']);
    const devices = (await ctx.inject('GET', '/api/devices?all=1')).json as any[];
    expect(devices.filter((d) => d.entityId.includes(P))).toEqual([]);
  });

  it('acompanha o ciclo: etapas, término previsto, secagem e aviso de roupa pronta', async () => {
    await withWasher();
    const done: any[] = [];
    ctx.app.services.washer.on('done', (e) => done.push(e));
    await ctx.inject('GET', '/api/washer');
    await change('status', 'start');
    let w = (await ctx.inject('GET', `/api/washer/${P}`)).json;
    expect(w).toMatchObject({ running: true, statusLabel: 'Lavando', remainingMin: 35, startedAt: new Date(clock).toISOString(), endsAt: new Date(clock + 35 * 60_000).toISOString() });
    expect(w.steps.map((s: any) => s.state)).toEqual(['current', 'todo', 'todo']);

    advance(20);
    await change('progress', 'rinse');
    await change('time_remaining', '15');
    w = (await ctx.inject('GET', `/api/washer/${P}`)).json;
    expect(w.statusLabel).toBe('Enxaguando');
    expect(w.steps.map((s: any) => s.state)).toEqual(['done', 'current', 'todo']);

    advance(10);
    await change('progress', 'dry'); // programa com secagem: aparece a etapa Secar
    w = (await ctx.inject('GET', `/api/washer/${P}`)).json;
    expect(w.steps.map((s: any) => [s.label, s.state])).toEqual([['Lavar', 'done'], ['Enxaguar', 'done'], ['Centrifugar', 'done'], ['Secar', 'current']]);
    const voice = await chat(ctx, 'Luna, quanto falta para a máquina de lavar?');
    expect(voice.reply).toMatch(/está secando\. Faltam 15 minutos, termina às \d\d:\d\d\./);

    advance(35);
    await change('time_remaining', '0');
    await change('status', 'end');
    expect(done).toEqual([{ text: '👕 Roupa pronta! A lava e seca terminou (Programa 119, 1 h 05 min).', speech: 'A roupa está pronta! A lava e seca terminou.', speak: true }]);
    w = (await ctx.inject('GET', `/api/washer/${P}`)).json;
    expect(w).toMatchObject({ statusLabel: 'Terminou', weekCycles: 1, avgMinutes: 65, remainingMin: null });
    expect(w.steps.every((s: any) => s.state === 'done')).toBe(true);
    // Repetir “end” não avisa de novo; desligar depois também não
    await change('status', 'end');
    await change('status', 'idle');
    expect(done).toHaveLength(1);
  });

  it('avisa mesmo quando a máquina volta direto para pronta com o tempo zerado; não avisa se for cancelada', async () => {
    await withWasher();
    const done: any[] = [];
    ctx.app.services.washer.on('done', (e) => done.push(e));
    await ctx.inject('GET', '/api/washer');
    await change('status', 'start');
    advance(10);
    await change('status', 'idle'); // desligou no meio (ainda faltavam 35 min)
    expect(done).toHaveLength(0);
    expect((await ctx.inject('GET', `/api/washer/${P}`)).json.weekCycles).toBe(0);

    await change('status', 'start');
    advance(40);
    await change('time_remaining', '0');
    await change('status', 'standby');
    expect(done).toHaveLength(1);

    // Aviso desligado nas preferências
    await ctx.inject('PATCH', `/api/washer/${P}/prefs`, { notifyDone: false });
    await change('status', 'start');
    await change('status', 'end');
    expect(done).toHaveLength(1);
    expect((await ctx.inject('GET', `/api/washer/${P}`)).json.weekCycles).toBe(2);
  });

  it('botões: começar, pausar e desligar pelos interruptores da integração', async () => {
    await withWasher();
    await ctx.inject('POST', `/api/washer/${P}/run`, { on: true });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'switch', service: 'turn_on', data: { entity_id: `switch.${P}_start` } });
    await ctx.inject('POST', `/api/washer/${P}/run`, { on: false });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'switch', service: 'turn_off', data: { entity_id: `switch.${P}_start` } });
    await ctx.inject('POST', `/api/washer/${P}/power`, { on: false });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'switch', service: 'turn_off', data: { entity_id: `switch.${P}_power` } });
    // Desligada: não manda começar
    ctx.ha.states.set(`switch.${P}_power`, { ...ctx.ha.states.get(`switch.${P}_power`)!, state: 'off' });
    const r = await ctx.inject('POST', `/api/washer/${P}/run`, { on: true });
    expect(r.status).toBe(409);
    expect((await ctx.inject('POST', '/api/washer/999/run', { on: true })).status).toBe(404);
  });

  it('voz: perguntar sempre; comandos só com autorização', async () => {
    await withWasher();
    await ctx.inject('GET', '/api/washer');
    let r = await chat(ctx, 'a roupa está pronta?');
    expect(r.reply).toMatch(/pronta para começar/);
    r = await chat(ctx, 'pausa a máquina de lavar');
    expect(r.reply).toMatch(/não está autorizada/);
    expect(ctx.ha.calls).toHaveLength(0);
    await ctx.inject('POST', `/api/washer/${P}/voice`, { allowed: true });
    r = await chat(ctx, 'desliga a lava e seca');
    expect(r.reply).toMatch(/Desliguei a lava e seca/);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'switch', service: 'turn_off', data: { entity_id: `switch.${P}_power` } });
  });

  it('NLU reconhece a lava e seca sem confundir com outros aparelhos', () => {
    expect(parseIntent('quanto falta para a máquina?')).toEqual({ type: 'washer', command: 'status' });
    expect(parseIntent('quando a lava e seca termina?')).toEqual({ type: 'washer', command: 'status' });
    expect(parseIntent('pausa a lavagem')).toEqual({ type: 'washer', command: 'pause' });
    expect(parseIntent('continua a máquina de lavar')).toEqual({ type: 'washer', command: 'start' });
    expect(parseIntent('desliga a máquina de lavar')).toEqual({ type: 'washer', command: 'off' });
    expect(parseIntent('liga a máquina de café')).not.toMatchObject({ type: 'washer' });
    expect(parseIntent('aspira a casa')).toMatchObject({ type: 'vacuum' });
  });
});
