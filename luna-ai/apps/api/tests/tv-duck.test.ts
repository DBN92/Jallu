import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const tv = (state: string, attrs: Record<string, unknown> = {}) => ({
  entity_id: 'media_player.tv_sala',
  state,
  attributes: { friendly_name: 'TV da Sala', supported_features: 1 | 4 | 8, is_volume_muted: false, volume_level: 0.3, ...attrs },
});

describe('TV no mudo enquanto a Luna escuta', () => {
  it('escolhe a TV (só as que existem), silencia ao chamar e devolve ao terminar', async () => {
    ctx = await makeApp();
    ctx.ha.states.set('media_player.tv_sala', tv('on'));
    ctx.ha.states.set('media_player.sem_volume', { entity_id: 'media_player.sem_volume', state: 'on', attributes: { friendly_name: 'Chromecast', supported_features: 1 } });
    const list = (await ctx.inject('GET', '/api/tv')).json;
    expect(list.options.map((o: { entityId: string }) => o.entityId)).toEqual(['media_player.tv_sala']);
    expect((await ctx.inject('PUT', '/api/tv', { entityId: 'media_player.inventada' })).status).toBe(400);
    expect((await ctx.inject('PUT', '/api/tv', { entityId: 'media_player.tv_sala' })).json).toEqual({ entityId: 'media_player.tv_sala' });

    // o app chama com o token da Siri
    const token = (await ctx.inject('POST', '/api/siri/tokens', { name: 'Tablet' })).json.token as string;
    const duck = (on: boolean) => ctx.app.inject({ method: 'POST', url: '/api/tv/duck', payload: { on }, headers: { authorization: `Bearer ${token}` } });
    expect((await duck(true)).statusCode).toBe(200);
    await duck(true); // repetido não muda nada
    await duck(false);
    const calls = ctx.ha.calls.filter((c) => c.domain === 'media_player');
    expect(calls).toEqual([
      { domain: 'media_player', service: 'volume_mute', data: { entity_id: 'media_player.tv_sala', is_volume_muted: true } },
      { domain: 'media_player', service: 'volume_mute', data: { entity_id: 'media_player.tv_sala', is_volume_muted: false } },
    ]);
  });

  it('não mexe na TV desligada nem tira do mudo o que a pessoa já tinha silenciado', async () => {
    ctx = await makeApp();
    ctx.ha.states.set('media_player.tv_sala', tv('off'));
    await ctx.inject('PUT', '/api/tv', { entityId: 'media_player.tv_sala' });
    await ctx.inject('POST', '/api/tv/duck', { on: true });
    await ctx.inject('POST', '/api/tv/duck', { on: false });
    ctx.ha.states.set('media_player.tv_sala', tv('on', { is_volume_muted: true }));
    await ctx.inject('POST', '/api/tv/duck', { on: true });
    await ctx.inject('POST', '/api/tv/duck', { on: false });
    expect(ctx.ha.calls.filter((c) => c.domain === 'media_player')).toEqual([]);
  });

  it('TV sem mudo: abaixa o volume e devolve o volume de antes', async () => {
    ctx = await makeApp();
    ctx.ha.states.set('media_player.tv_sala', tv('playing', { supported_features: 4, volume_level: 0.42 }));
    await ctx.inject('PUT', '/api/tv', { entityId: 'media_player.tv_sala' });
    await ctx.inject('POST', '/api/tv/duck', { on: true });
    await ctx.inject('POST', '/api/tv/duck', { on: false });
    expect(ctx.ha.calls.filter((c) => c.domain === 'media_player').map((c) => c.data.volume_level)).toEqual([0.05, 0.42]);
  });
});
