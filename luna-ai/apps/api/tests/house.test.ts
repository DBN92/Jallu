import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

async function withLights() {
  ctx = await makeApp();
  const add = (entity_id: string, state: string, attributes: Record<string, unknown>) => ctx.ha.states.set(entity_id, { entity_id, state, attributes, last_changed: new Date().toISOString() });
  add('light.luminaria', 'on', { friendly_name: 'Luminária', supported_color_modes: ['rgb'], brightness: 128, rgb_color: [255, 216, 168] });
  add('fan.ventilador', 'off', { friendly_name: 'Ventilador' });
}

describe('Maquete 3D: vínculos e cor', () => {
  it('lâmpada colorida informa a cor e aceita trocar; lâmpada comum recusa', async () => {
    await withLights();
    const d = (await ctx.inject('GET', '/api/devices/light.luminaria')).json;
    expect(d).toMatchObject({ supportsColor: true, supportsBrightness: true, rgb: [255, 216, 168], brightness: 50 });
    const r = await ctx.inject('POST', '/api/devices/light.luminaria/color', { rgb: [124, 107, 255] });
    expect(r.json.rgb).toEqual([124, 107, 255]);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.luminaria', rgb_color: [124, 107, 255] } });
    expect((await ctx.inject('POST', '/api/devices/light.luz_da_sala/color', { rgb: [1, 2, 3] })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/devices/fan.ventilador/color', { rgb: [1, 2, 3] })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/devices/light.luminaria/color', { rgb: [300, 0, 0] })).status).toBe(400);
  });

  it('vínculos: só entidades reais e do tipo certo; “nenhuma” e voltar ao automático', async () => {
    await withLights();
    expect((await ctx.inject('GET', '/api/house/links')).json).toEqual({});
    expect((await ctx.inject('PUT', '/api/house/links/luminaria', { entityId: 'light.luminaria' })).json).toEqual({ luminaria: 'light.luminaria' });
    expect((await ctx.inject('PUT', '/api/house/links/ventilador', { entityId: 'fan.ventilador' })).json).toMatchObject({ ventilador: 'fan.ventilador' });
    // entidade que não existe, tipo errado e item desconhecido são recusados
    expect((await ctx.inject('PUT', '/api/house/links/cabeceira', { entityId: 'light.inventada' })).status).toBe(404);
    expect((await ctx.inject('PUT', '/api/house/links/cabeceira', { entityId: 'fan.ventilador' })).status).toBe(400);
    expect((await ctx.inject('PUT', '/api/house/links/portao', { entityId: 'light.luminaria' })).status).toBe(400);
    expect((await ctx.inject('PUT', '/api/house/links/cabeceira', { entityId: null })).json).toMatchObject({ cabeceira: null });
    expect((await ctx.inject('DELETE', '/api/house/links/cabeceira')).json).toEqual({ luminaria: 'light.luminaria', ventilador: 'fan.ventilador' });
  });
});
