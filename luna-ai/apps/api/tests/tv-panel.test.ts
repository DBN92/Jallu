import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('Painel da TV: cenas e luzes do Início', () => {
  it('cenas padrão com entidades reais; cinema apaga a sala e deixa a luminária em 20%', async () => {
    ctx = await makeApp();
    ctx.ha.states.set('light.luminaria_sala', { entity_id: 'light.luminaria_sala', state: 'off', attributes: { friendly_name: 'Luminária sala', supported_color_modes: ['brightness'] } });
    ctx.ha.states.set('light.luz_da_sala', { entity_id: 'light.luz_da_sala', state: 'on', attributes: { friendly_name: 'Luz da Sala', supported_color_modes: ['brightness'] } });
    const panel = (await ctx.inject('GET', '/api/tv/panel')).json;
    expect(panel.scenes.map((s: { id: string }) => s.id)).toEqual(['cinema', 'boa-noite', 'acender', 'apagar']);
    expect(panel.scenesDefault).toBe(true);
    expect(panel.favoritesAuto).toBe(true);
    expect(panel.favorites.length).toBeGreaterThan(0);

    ctx.ha.calls.length = 0;
    const r = (await ctx.inject('POST', '/api/tv/scene/cinema')).json;
    expect(r.ok).toBe(true);
    const lightCalls = ctx.ha.calls.filter((c) => c.domain === 'light');
    expect(lightCalls).toContainEqual({ domain: 'light', service: 'turn_off', data: { entity_id: 'light.luz_da_sala' } });
    expect(lightCalls).toContainEqual({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.luminaria_sala', brightness_pct: 20 } });
    expect(lightCalls.some((c) => c.data.entity_id === 'light.luz_do_quarto_casal')).toBe(false);
    expect((await ctx.inject('POST', '/api/tv/scene/inventada')).status).toBe(404);
  });

  it('as luzes do Início seguem o uso e podem ser escolhidas à mão (só entidades que existem)', async () => {
    ctx = await makeApp();
    for (let i = 0; i < 3; i++) await ctx.inject('POST', '/api/devices/light.luz_da_varanda/turn-on');
    const auto = (await ctx.inject('GET', '/api/tv/panel')).json;
    expect(auto.favorites[0]).toBe('light.luz_da_varanda');

    expect((await ctx.inject('PUT', '/api/tv/panel', { favorites: ['light.inventada'] })).status).toBe(400);
    const saved = (await ctx.inject('PUT', '/api/tv/panel', { favorites: ['light.luz_da_sala'] })).json;
    expect(saved).toMatchObject({ favorites: ['light.luz_da_sala'], favoritesAuto: false });
    const back = (await ctx.inject('PUT', '/api/tv/panel', { favorites: null })).json;
    expect(back.favoritesAuto).toBe(true);
  });
});
