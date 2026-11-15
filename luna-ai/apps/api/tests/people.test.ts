import { afterEach, describe, expect, it } from 'vitest';
import { parseIntent } from '../src/modules/ai/nlu';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const set = (id: string, state: string, attributes: Record<string, unknown>, at = new Date().toISOString()) => ctx.ha.states.set(id, { entity_id: id, state, attributes, last_changed: at });
const say = async (message: string) => (await ctx.inject('POST', '/api/chat', { message })).json.reply as string;

async function withPeople() {
  ctx = await makeApp();
  for (const id of [...ctx.ha.states.keys()]) if (id.startsWith('person.')) ctx.ha.states.delete(id);
  set('person.daniel', 'home', { friendly_name: 'Daniel', entity_picture: '/api/image/serve/abc/512x512' }, '2026-11-15T21:20:00.000Z');
  set('person.ana', 'Trabalho', { friendly_name: 'Ana' }, '2026-11-15T12:00:00.000Z');
  set('sun.sun', 'below_horizon', { friendly_name: 'Sol' });
  set('light.luz_da_garagem', 'off', { friendly_name: 'Luz da Garagem', supported_color_modes: ['onoff'] });
  await ctx.app.services.devices.refresh(true);
}

describe('Quem está em casa', () => {
  it('entende as perguntas por voz', () => {
    expect(parseIntent('Oi Luna, quem está em casa?')).toEqual({ type: 'people', name: null });
    expect(parseIntent('tem alguém em casa?')).toEqual({ type: 'people', name: null });
    expect(parseIntent('o Daniel já chegou?')).toEqual({ type: 'people', name: 'daniel' });
    expect(parseIntent('a Ana está em casa?')).toEqual({ type: 'people', name: 'ana' });
    expect(parseIntent('onde está a Ana?')).toEqual({ type: 'people', name: 'ana' });
    // não confunde com outras coisas que “chegam”
    expect(parseIntent('o carro já saiu?')?.type).not.toBe('people');
    expect(parseIntent('a roupa já está pronta?')?.type).not.toBe('people');
    expect(parseIntent('tem arroz em casa?')?.type).not.toBe('people');
  });

  it('lista, responde por voz e dá a foto', async () => {
    await withPeople();
    const list = (await ctx.inject('GET', '/api/people')).json;
    expect(list).toEqual([
      expect.objectContaining({ id: 'person.daniel', name: 'Daniel', home: true, place: 'Em casa', picture: true }),
      expect.objectContaining({ id: 'person.ana', name: 'Ana', home: false, place: 'Trabalho', picture: false }),
    ]);
    expect(await say('quem está em casa?')).toBe('Em casa: Daniel. Fora: Ana (Trabalho).');
    expect(await say('o Daniel já chegou?')).toMatch(/^Sim, Daniel está em casa desde as \d\d:\d\d\.$/);
    expect(await say('a Ana está em casa?')).toMatch(/^Não, Ana está em Trabalho desde as \d\d:\d\d\.$/);
  });

  it('chegou à noite: acende a luz escolhida; saiu o último: apaga as luzes e avisa no celular', async () => {
    await withPeople();
    await ctx.inject('POST', '/api/push/subscribe', { endpoint: 'https://web.push.apple.com/QGabc', keys: { p256dh: 'BOr7xYz0123456789abcdefghij', auth: 'abcdefgh12345' } });
    expect((await ctx.inject('PUT', '/api/people/config', { arriveLight: 'light.luz_da_garagem' })).json).toEqual({ arriveLight: 'light.luz_da_garagem', leaveLightsOff: true, leaveNotify: true });
    expect((await ctx.inject('PUT', '/api/people/config', { arriveLight: 'switch.qualquer' })).status).toBe(400);
    const people = ctx.app.services.people;

    // Ana chega (à noite): acende a garagem
    const anaOld = ctx.ha.states.get('person.ana')!;
    set('person.ana', 'home', { friendly_name: 'Ana' });
    await people.handleStateChanged({ entity_id: 'person.ana', old_state: anaOld, new_state: ctx.ha.states.get('person.ana')! });
    expect(ctx.ha.calls.some((c) => c.domain === 'light' && c.service === 'turn_on' && (c.data as { entity_id: string }).entity_id === 'light.luz_da_garagem')).toBe(true);

    // Daniel sai (Ana ainda em casa): nada
    const dOld = ctx.ha.states.get('person.daniel')!;
    set('person.daniel', 'not_home', { friendly_name: 'Daniel' });
    await people.handleStateChanged({ entity_id: 'person.daniel', old_state: dOld, new_state: ctx.ha.states.get('person.daniel')! });
    expect(ctx.pushed).toHaveLength(0);

    // Ana sai por último: apaga as luzes e avisa
    const aOld = ctx.ha.states.get('person.ana')!;
    set('person.ana', 'not_home', { friendly_name: 'Ana' });
    await people.handleStateChanged({ entity_id: 'person.ana', old_state: aOld, new_state: ctx.ha.states.get('person.ana')! });
    await new Promise((r) => setTimeout(r, 30));
    expect(ctx.ha.calls.some((c) => c.domain === 'light' && c.service === 'turn_off')).toBe(true);
    expect(ctx.pushed).toHaveLength(1);
    expect(ctx.pushed[0]!.payload).toMatchObject({ title: 'Todos saíram de casa' });
    expect(ctx.pushed[0]!.payload.body).toMatch(/^Ana saiu por último\. Apaguei/);
    expect(await say('tem alguém em casa?')).toBe('Não tem ninguém em casa agora. Fora: Ana e Daniel.');
  });
});
