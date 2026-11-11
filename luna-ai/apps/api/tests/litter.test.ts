import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';
import { parseIntent } from '../src/modules/ai/nlu';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const P = 'smart_cat_litter_box_ti';

/** A caixa como aparece no Home Assistant do usuário (Smart cat litter box Ti+, via Tuya). */
async function withBox() {
  ctx = await makeApp();
  const now = new Date().toISOString();
  const add = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ctx.ha.states.set(entity_id, { entity_id, state, attributes, last_changed: now });
  add(`button.${P}_manual_clean`, 'unknown', { friendly_name: 'Smart cat litter box( Ti+) Manual clean' });
  add(`number.${P}_delay_clean_time`, '1.0', { friendly_name: 'Smart cat litter box( Ti+) Delay clean time', min: 1, max: 600, step: 1, unit_of_measurement: 's' });
  add(`sensor.${P}_cat_weight`, '5.2', { friendly_name: 'Smart cat litter box( Ti+) Cat weight', unit_of_measurement: 'kg', device_class: 'weight' });
  add(`sensor.${P}_excretion_duration`, '0', { unit_of_measurement: 's' });
  add(`sensor.${P}_excretion_times_day`, '0.0', { unit_of_measurement: 'times' });
  add(`sensor.${P}_status`, 'unknown', {});
  add(`switch.${P}_auto_clean`, 'off', { friendly_name: 'Smart cat litter box( Ti+) Auto clean' });
  fakeClock();
}

/** Simula o Home Assistant avisando uma mudança (como chega pelo WebSocket). */
async function change(entity: string, value: string) {
  const old = ctx.ha.states.get(entity)!;
  const next = { ...old, state: value };
  ctx.ha.states.set(entity, next);
  await ctx.app.services.litter.handleStateChanged({ entity_id: entity, old_state: old, new_state: next } as any);
}

/** Relógio de mentira: o tempo só anda quando o teste manda. */
let clock = Date.now();
const advance = (ms: number) => (clock += ms);
function fakeClock() {
  clock = Date.now();
  ctx.app.services.litter.now = () => new Date(clock);
}

/** Uma visita, 10 min depois da anterior: peso → contador sobe → duração 5 s depois. */
async function visit(weight: string, count: number, seconds: string) {
  advance(10 * 60_000);
  await change(`sensor.${P}_cat_weight`, weight);
  advance(60_000); // o gato fica ~1 min
  await change(`sensor.${P}_excretion_times_day`, `${count}.0`);
  advance(3_000);
  await change(`sensor.${P}_excretion_duration`, seconds);
}

describe('Caixa de areia (Smart Life / Tuya)', () => {
  it('aparece como uma caixa só e some da lista de aparelhos', async () => {
    await withBox();
    const boxes = (await ctx.inject('GET', '/api/litter')).json;
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ id: P, name: 'Caixa de areia', available: true, statusLabel: 'Disponível', autoClean: false, delaySeconds: 1, delayMax: 600, canClean: true, todayCount: 0 });
    expect(boxes[0].cats.map((c: any) => c.name)).toEqual(['Gato 1', 'Gato 2', 'Gato 3', 'Gato 4', 'Gato 5', 'Gato 6']);
    const devices = (await ctx.inject('GET', '/api/devices?all=1')).json as any[];
    expect(devices.filter((d) => d.entityId.includes(P))).toEqual([]);
  });

  it('registra cada visita, aprende o peso de cada gato e conta repetições do mesmo peso', async () => {
    await withBox();
    await ctx.inject('GET', '/api/litter');
    await visit('5.2', 1, '120'); // peso igual ao atual: não gera evento de peso, só o contador
    await visit('4.1', 2, '60');
    await visit('5.25', 3, '90'); // mesmo gato do primeiro
    advance(10 * 60_000);
    await change(`sensor.${P}_excretion_times_day`, '4.0'); // mesmo peso de novo: só o contador sobe
    // Peso que chega 4 s DEPOIS do contador (atraso da nuvem) corrige a visita certa
    advance(10 * 60_000);
    await change(`sensor.${P}_excretion_times_day`, '5.0');
    advance(4_000);
    await change(`sensor.${P}_cat_weight`, '4.05');
    // Outro gato entrando 20 s depois: o peso é do PRÓXIMO, não muda a visita anterior
    advance(20_000);
    await change(`sensor.${P}_cat_weight`, '3.7');
    const b = (await ctx.inject('GET', `/api/litter/${P}`)).json;
    expect(b.week.at(-1).count).toBe(5);
    expect(b.recent.map((v: any) => [v.catName, v.weightKg])).toEqual([['Gato 2', 4.05], ['Gato 1', 5.25], ['Gato 1', 5.25], ['Gato 2', 4.1], ['Gato 1', 5.2]]);
    expect(b.recent.map((v: any) => v.durationS)).toEqual([90, 90, 90, 60, 120]);
    const g1 = b.cats.find((c: any) => c.name === 'Gato 1');
    expect(g1.todayVisits).toBe(3);
    expect(g1.weightKg).toBeGreaterThan(5.2);
    expect(b.cats.find((c: any) => c.name === 'Gato 2')).toMatchObject({ todayVisits: 2 });
    // meia-noite: o contador volta a zero sem criar visita
    await change(`sensor.${P}_excretion_times_day`, '0.0');
    expect((await ctx.inject('GET', `/api/litter/${P}`)).json.recent).toHaveLength(5);
  });

  it('renomeia o gato e fixa o peso informado', async () => {
    await withBox();
    const cats = (await ctx.inject('GET', '/api/litter')).json[0].cats;
    await ctx.inject('PATCH', `/api/litter/cats/${cats[0].id}`, { name: 'Mia', weightKg: 3.6 });
    await visit('3.7', 1, '50');
    const b = (await ctx.inject('GET', `/api/litter/${P}`)).json;
    expect(b.cats[0]).toMatchObject({ name: 'Mia', weightKg: 3.6, weightSet: true, todayVisits: 1 });
    expect(b.lastVisit.catName).toBe('Mia');
  });

  it('limpa agora e liga a limpeza automática com espera segura', async () => {
    await withBox();
    await ctx.inject('POST', `/api/litter/${P}/clean`);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'button', service: 'press', data: { entity_id: `button.${P}_manual_clean` } });
    const r = await ctx.inject('POST', `/api/litter/${P}/auto`, { on: true, delaySeconds: 180 });
    expect(ctx.ha.calls.slice(-2)).toMatchObject([
      { domain: 'number', service: 'set_value', data: { entity_id: `number.${P}_delay_clean_time`, value: 180 } },
      { domain: 'switch', service: 'turn_on', data: { entity_id: `switch.${P}_auto_clean` } },
    ]);
    expect(r.json).toMatchObject({ autoClean: true, delaySeconds: 180 });
    expect((await ctx.inject('POST', `/api/litter/${P}/auto`, { on: true, delaySeconds: 99999 })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/litter/caixa_que_nao_existe/clean')).status).toBe(404);
  });

  it('voz: só com autorização; entende limpar, ligar automático e perguntar', async () => {
    await withBox();
    await ctx.inject('GET', '/api/litter');
    let r = await chat(ctx, 'Luna, limpa a caixa de areia');
    expect(r.reply).toMatch(/não está autorizada/);
    expect(ctx.ha.calls).toHaveLength(0);
    await ctx.inject('POST', `/api/litter/${P}/voice`, { allowed: true });
    r = await chat(ctx, 'limpa a caixa de areia');
    expect(r.reply).toMatch(/Mandei a caixa de areia fazer a limpeza/);
    r = await chat(ctx, 'liga a limpeza automática da caixa de areia');
    expect(r.reply).toMatch(/ligada com espera de 3 min/);
    await visit('4.4', 1, '40');
    r = await chat(ctx, 'quantas vezes os gatos usaram a caixa de areia hoje?');
    expect(r.reply).toMatch(/usada 1 vez/);
    expect(r.reply).toMatch(/Gato 1/);
  });

  it('NLU separa caixa de areia do aspirador', () => {
    expect(parseIntent('limpa a caixa de areia')).toEqual({ type: 'litter', command: 'clean' });
    expect(parseIntent('desliga a limpeza automática da caixa dos gatos')).toEqual({ type: 'litter', command: 'auto_off' });
    expect(parseIntent('a caixa de areia está limpa?')).toEqual({ type: 'litter', command: 'status' });
    expect(parseIntent('aspira a casa')).toMatchObject({ type: 'vacuum' });
    expect(parseIntent('quando eu sair limpa a caixa de areia')).toBeNull();
  });
});
