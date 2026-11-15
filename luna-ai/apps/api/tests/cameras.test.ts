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
  it('erro de imagem mostra o motivo; diagnóstico aponta a etapa que falha', async () => {
    await withCameras();
    ctx.ha.states.set('camera.offline', { entity_id: 'camera.offline', state: 'idle', attributes: { friendly_name: 'Quintal', supported_features: 2 } });
    const snap = await ctx.inject('GET', '/api/cameras/camera.offline/snapshot');
    expect(snap.status).toBe(502);
    expect(snap.json.message).toMatch(/HTTP 500: Error fetching camera image/);
    const ok = await ctx.inject('GET', '/api/cameras/camera.garagem/diagnose');
    expect(ok.json.steps.every((s: { ok: boolean }) => s.ok)).toBe(true);
    expect(ok.json.steps.map((s: { step: string }) => s.step)).toEqual(['Câmera no Home Assistant', 'Foto (Home Assistant → câmera)', 'Início do vídeo (HLS)', 'Lista de vídeo (playlist)']);
    const bad = await ctx.inject('GET', '/api/cameras/camera.offline/diagnose');
    expect(bad.json.steps.find((s: { ok: boolean }) => !s.ok).step).toBe('Foto (Home Assistant → câmera)');
  });

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
    // endereço absoluto do HA reescrito para passar pela Luna
    expect(pl.body).toContain('/api/cameras/hls/tok123/playlist.m3u8');
    expect(pl.body).not.toMatch(/^\/api\/hls\//m);
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

  it('a resposta vai para as outras telas do usuário (a TV abre a câmera pedida no celular)', async () => {
    await withCameras();
    const sent: { userId: string; event: unknown }[] = [];
    const hub = ctx.app.services.hub;
    const orig = hub.toUser.bind(hub);
    hub.toUser = (userId, event) => {
      sent.push({ userId, event });
      orig(userId, event);
    };
    await chat(ctx, 'mostre a câmera da garagem');
    const replies = sent.filter((s) => (s.event as { type: string }).type === 'assistant_reply');
    expect(replies).toHaveLength(1);
    expect(replies[0]!.event).toMatchObject({ type: 'assistant_reply', userText: 'mostre a câmera da garagem', reply: 'Abrindo a câmera Garagem.', cameraIds: ['camera.garagem'] });
  });
});

describe('babá eletrônica (câmera Smart Life/Tuya com sensores no mesmo aparelho)', () => {
  async function withMonitor() {
    ctx = await makeApp();
    const set = (id: string, state: string, attributes: Record<string, unknown>) => ctx.ha.states.set(id, { entity_id: id, state, attributes });
    set('camera.baba_eletronica', 'idle', { friendly_name: 'Babá eletrônica', supported_features: 2 });
    set('sensor.baba_eletronica_temperature', '23.44', { friendly_name: 'Babá eletrônica Temperature', unit_of_measurement: '°C', device_class: 'temperature' });
    set('sensor.baba_eletronica_humidity', '61', { friendly_name: 'Babá eletrônica Humidity', unit_of_measurement: '%', device_class: 'humidity' });
    set('binary_sensor.baba_eletronica_cry', 'off', { friendly_name: 'Babá eletrônica Choro' });
    set('switch.baba_eletronica_privacy_mode', 'off', { friendly_name: 'Babá eletrônica Privacy mode' });
    set('switch.baba_eletronica_flip', 'off', { friendly_name: 'Babá eletrônica Flip' });
    set('sensor.outra_coisa', '5', { friendly_name: 'Outra coisa', unit_of_measurement: 'W' });
    const reg = new Map(
      ['camera.baba_eletronica', 'sensor.baba_eletronica_temperature', 'sensor.baba_eletronica_humidity', 'binary_sensor.baba_eletronica_cry', 'switch.baba_eletronica_privacy_mode', 'switch.baba_eletronica_flip'].map((id) => [id, { platform: 'tuya', hidden: false, deviceId: 'dev1' }] as const),
    );
    ctx.app.services.cameras.setBackends(async () => new Map([...reg, ['sensor.outra_coisa', { platform: 'x', hidden: false, deviceId: 'dev2' }]]), async <T,>() => ({}) as T);
    return ctx;
  }

  it('mostra o que o aparelho informa, sem misturar outros aparelhos', async () => {
    await withMonitor();
    const [cam] = (await ctx.inject('GET', '/api/cameras')).json;
    expect(cam.info).toEqual([
      expect.objectContaining({ kind: 'cry', label: 'Detectando choro', value: 'nada agora', active: false }),
      expect.objectContaining({ kind: 'temperature', value: '23,4 °C' }),
      expect.objectContaining({ kind: 'humidity', value: '61%' }),
      expect.objectContaining({ kind: 'privacy', label: 'Modo privacidade', value: 'desligada' }),
    ]);
  });

  it('choro detectado avisa no celular, no máximo a cada 3 minutos', async () => {
    await withMonitor();
    const sent: string[] = [];
    ctx.app.services.cameras.notify = (t, b) => sent.push(`${t}: ${b}`);
    await ctx.inject('GET', '/api/cameras');
    const on = (old: string) => ({ entity_id: 'binary_sensor.baba_eletronica_cry', old_state: { entity_id: 'binary_sensor.baba_eletronica_cry', state: old, attributes: {} }, new_state: { entity_id: 'binary_sensor.baba_eletronica_cry', state: 'on', attributes: { friendly_name: 'Babá eletrônica Choro' } } });
    await ctx.app.services.cameras.handleStateChanged(on('off'));
    await ctx.app.services.cameras.handleStateChanged(on('off'));
    expect(sent).toEqual(['Babá eletrônica: Choro detectado — toque para ver a câmera.']);
  });
});
