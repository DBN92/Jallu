import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';
import { parseRtspUrl } from '../src/modules/cameras/direct.service';
import { TuyaCloud } from '../src/integrations/tuya/cloud';

let hasFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hasFfmpeg = false;
}

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const DEVICE = 'eb262a73406b73a9f2m2my';

/** Nuvem Tuya de mentira: confere a assinatura e entrega token, aparelhos e endereço de vídeo */
function fakeTuya(calls: string[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const h = init!.headers as Record<string, string>;
    const path = url.pathname + url.search;
    const body = typeof init?.body === 'string' ? init.body : '';
    const str = [init!.method, createHash('sha256').update(body).digest('hex'), '', path].join('\n');
    const expected = createHmac('sha256', 'segredo').update('id123' + (h.access_token ?? '') + h.t + h.nonce + str).digest('hex').toUpperCase();
    calls.push(`${init!.method} ${url.pathname}`);
    const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { headers: { 'content-type': 'application/json' } });
    if (h.sign !== expected) return new Response(JSON.stringify({ success: false, code: 1004, msg: 'sign invalid' }));
    if (url.pathname === '/v1.0/token') return ok({ access_token: 'tok', expire_time: 7200, uid: 'u1' });
    if (h.access_token !== 'tok') return new Response(JSON.stringify({ success: false, code: 1010, msg: 'token invalid' }));
    if (url.pathname === '/v1.0/iot-01/associated-users/devices') return ok({ devices: [{ id: DEVICE, name: 'Câmera Luiza', category: 'cdsxj', online: true }] });
    if (url.pathname === `/v1.0/devices/${DEVICE}/stream/actions/allocate`)
      return ok({ url: JSON.parse(body).type === 'hls' ? 'https://camera.tuya.example/live/abc/index.m3u8' : 'rtsps://camera.tuya.example:443/live/abc' });
    return new Response(JSON.stringify({ success: false, code: 404, msg: 'nao existe' }));
  }) as typeof fetch;
}

describe('nuvem Tuya (câmeras Smart Life que o Home Assistant não suporta)', () => {
  it('aceita tuya://<aparelho> como endereço de câmera direta', () => {
    expect(parseRtspUrl(`tuya://${DEVICE}`)).toEqual({ url: `tuya://${DEVICE}` });
    expect(() => parseRtspUrl('tuya://x')).toThrow();
  });

  it('assina as chamadas, renova o token e pede o endereço de vídeo', async () => {
    const calls: string[] = [];
    const cloud = new TuyaCloud('id123', 'segredo', 'https://openapi.tuyaus.com', fakeTuya(calls));
    expect(await cloud.devices()).toEqual([{ id: DEVICE, name: 'Câmera Luiza', category: 'cdsxj', online: true }]);
    expect(await cloud.streamUrl(DEVICE)).toBe('rtsps://camera.tuya.example:443/live/abc');
    // o token é reaproveitado
    expect(calls.filter((c) => c.endsWith('/v1.0/token'))).toHaveLength(1);
  });

  it('sem chave no .env, avisa como configurar (e não chama a nuvem)', async () => {
    ctx = await makeApp();
    expect((await ctx.inject('GET', '/api/cameras/tuya')).json).toEqual({ configured: false, devices: [], error: null });
  });

  it.skipIf(!hasFfmpeg)('a babá vira câmera direta: o vídeo abre pelo endereço pedido à nuvem', async () => {
    const calls: string[] = [];
    const seen: string[] = [];
    ctx = await makeApp(
      { TUYA_ACCESS_ID: 'id123', TUYA_ACCESS_SECRET: 'segredo' },
      { login: true, tuyaFetch: fakeTuya(calls), cameraInput: (url, transport) => (seen.push(`${transport} ${url}`), ['-re', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10']) },
    );
    const list = (await ctx.inject('GET', '/api/cameras/tuya')).json;
    expect(list.devices[0]).toMatchObject({ id: DEVICE, name: 'Câmera Luiza' });
    const created = await ctx.inject('POST', '/api/cameras/direct', { name: 'Câmera Luiza', url: `tuya://${DEVICE}`, transport: 'udp' });
    expect(created.status).toBe(200);
    const test = await ctx.inject('POST', '/api/cameras/direct/test', { url: `tuya://${DEVICE}`, transport: 'udp' });
    expect(test.json.ok).toBe(true);
    const snap = await ctx.app.inject({ method: 'GET', url: `/api/cameras/${created.json.entityId}/snapshot`, headers: { cookie: ctx.cookies } });
    expect(snap.statusCode).toBe(200);
    expect(seen.every((s) => s === 'tcp rtsps://camera.tuya.example:443/live/abc')).toBe(true);
    expect(calls.filter((c) => c.includes('/stream/actions/allocate')).length).toBeGreaterThanOrEqual(2);
  }, 40_000);

  it.skipIf(!hasFfmpeg)('modelo que não entrega RTSP: tenta HLS sozinho e passa a usar o que funcionou', async () => {
    const seen: string[] = [];
    ctx = await makeApp(
      { TUYA_ACCESS_ID: 'id123', TUYA_ACCESS_SECRET: 'segredo' },
      {
        login: true,
        tuyaFetch: fakeTuya([]),
        // RTSP “não responde”; HLS entrega imagem
        cameraInput: (url) => (seen.push(url), url.startsWith('rtsps:') ? ['-f', 'lavfi', '-i', 'filtro_que_nao_existe'] : ['-re', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10']),
      },
    );
    const created = await ctx.inject('POST', '/api/cameras/direct', { name: 'Câmera Luiza', url: `tuya://${DEVICE}`, transport: 'udp' });
    const test = await ctx.inject('POST', '/api/cameras/direct/test', { url: `tuya://${DEVICE}`, transport: 'udp' });
    expect(test.json).toMatchObject({ ok: true });
    expect(test.json.detail).toMatch(/nuvem Tuya \(HLS\)/);
    seen.length = 0;
    const snap = await ctx.app.inject({ method: 'GET', url: `/api/cameras/${created.json.entityId}/snapshot`, headers: { cookie: ctx.cookies } });
    expect(snap.statusCode).toBe(200);
    expect(seen[0]).toBe('https://camera.tuya.example/live/abc/index.m3u8');
  }, 60_000);
});
