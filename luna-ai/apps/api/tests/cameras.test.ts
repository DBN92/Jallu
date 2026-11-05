import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

async function withCameras() {
  ctx = await makeApp();
  ctx.ha.states.set('camera.garagem', { entity_id: 'camera.garagem', state: 'idle', attributes: { friendly_name: 'Câmera Garagem', supported_features: 2 } });
  ctx.ha.states.set('camera.sala', { entity_id: 'camera.sala', state: 'idle', attributes: { friendly_name: 'Sala', supported_features: 0 } });
  ctx.app.services.cameras.setBackends(
    async () => new Map([['camera.garagem', { platform: 'onvif', hidden: false }], ['camera.sala', { platform: 'generic', hidden: false }]]),
    async <T,>(payload: Record<string, unknown>) => {
      expect(payload).toMatchObject({ type: 'camera/stream', format: 'hls' });
      return { url: '/api/hls/tok123/master_playlist.m3u8' } as T;
    },
  );
  return ctx;
}

describe('câmeras (via Home Assistant)', () => {
  it('lista câmeras e identifica vídeo ao vivo e controle de movimento (ONVIF)', async () => {
    await withCameras();
    const r = await ctx.inject('GET', '/api/cameras');
    expect(r.json).toEqual([
      expect.objectContaining({ entityId: 'camera.garagem', name: 'Câmera Garagem', stream: true, ptz: true }),
      expect.objectContaining({ entityId: 'camera.sala', stream: false, ptz: false }),
    ]);
  });

  it('repassa a foto da câmera sem expor o token do HA', async () => {
    await withCameras();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/cameras/camera.garagem/snapshot', headers: { cookie: ctx.cookies } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.rawPayload.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    ctx.cookies = '';
    expect((await ctx.inject('GET', '/api/cameras/camera.garagem/snapshot')).status).toBe(401);
  });

  it('vídeo ao vivo: sessão HLS emitida pela Luna e repassada; tokens desconhecidos são recusados', async () => {
    await withCameras();
    const s = await ctx.inject('POST', '/api/cameras/camera.garagem/stream');
    expect(s.json.url).toBe('/api/cameras/hls/tok123/master_playlist.m3u8');
    const pl = await ctx.app.inject({ method: 'GET', url: s.json.url });
    expect(pl.statusCode).toBe(200);
    expect(pl.body).toContain('#EXTM3U');
    expect((await ctx.app.inject({ method: 'GET', url: '/api/cameras/hls/naoexiste/master_playlist.m3u8' })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/cameras/hls/tok123/../../states' })).statusCode).toBe(404);
    expect((await ctx.inject('POST', '/api/cameras/camera.sala/stream')).status).toBe(409);
  });

  it('movimento (ONVIF): chama onvif.ptz; câmera sem ONVIF recusa', async () => {
    await withCameras();
    expect((await ctx.inject('POST', '/api/cameras/camera.garagem/ptz', { action: 'left' })).status).toBe(200);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'onvif', service: 'ptz', data: { entity_id: 'camera.garagem', pan: 'LEFT', move_mode: 'ContinuousMove' } });
    await ctx.inject('POST', '/api/cameras/camera.garagem/ptz', { action: 'zoom_in' });
    expect(ctx.ha.calls.at(-1)!.data).toMatchObject({ zoom: 'ZOOM_IN' });
    expect((await ctx.inject('POST', '/api/cameras/camera.sala/ptz', { action: 'up' })).status).toBe(400);
    expect((await ctx.inject('POST', '/api/cameras/camera.garagem/ptz', { action: 'explodir' })).status).toBe(400);
  });

  it('por voz: “mostre a câmera da garagem” abre a câmera', async () => {
    await withCameras();
    const r = await chat(ctx, 'Luna, mostre a câmera da garagem');
    expect(r.reply).toBe('Abrindo a câmera Garagem.');
    expect(r.actions[0]).toMatchObject({ tool: 'show_camera', entityIds: ['camera.garagem'] });
    const all = await chat(ctx, 'quero ver as câmeras');
    expect(all.actions[0]!.tool).toBe('show_camera');
  });
});
