import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';
import { parseRtspUrl } from '../src/modules/cameras/direct.service';
import { TuyaCloud } from '../src/integrations/tuya/cloud';
import { Go2rtc } from '../src/integrations/go2rtc/go2rtc';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const GO2RTC = resolve(__dirname, '../../../runtime/go2rtc/go2rtc');

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
    if (url.pathname === `/v1.0/devices/${DEVICE}`) return ok({ id: DEVICE, uid: 'dono-da-conta' });
    if (url.pathname === '/v1.0/iot-01/associated-users/devices') return ok({ devices: [{ id: DEVICE, name: 'Câmera Luiza', category: 'cdsxj', online: true }, { id: 'caixa1234567890ab', name: 'Smart cat litter box( Ti+)', category: 'msp', online: true }] });
    if (url.pathname === '/v1.0/devices/caixa1234567890ab/functions') return ok({ functions: [{ code: 'auto_clean', type: 'Boolean' }, { code: 'factory_reset', type: 'Boolean' }, { code: 'manual_clean', type: 'Boolean' }] });
    if (url.pathname === '/v1.0/devices/caixa1234567890ab/status') return ok([{ code: 'manual_clean', value: false }, { code: 'work_status', value: 'standby' }]);
    if (url.pathname === '/v2.0/cloud/thing/caixa1234567890ab/model')
      return ok({ model: JSON.stringify({ services: [{ properties: [{ code: 'manual_clean', accessMode: 'rw' }, { code: 'factory_reset', accessMode: 'rw' }, { code: 'cat_weight', accessMode: 'ro' }] }] }) });
    if (url.pathname === '/v2.0/cloud/thing/caixa1234567890ab/shadow/properties/issue') {
      calls.push(`propriedade ${body}`);
      return (globalThis as { __tuyaFail?: boolean }).__tuyaFail ? new Response(JSON.stringify({ success: false, code: 2008, msg: 'command or value not support' })) : ok({});
    }
    if (url.pathname === '/v1.0/devices/caixa1234567890ab/commands') {
      calls.push(`comando ${body}`);
      return (globalThis as { __tuyaFail?: boolean }).__tuyaFail ? new Response(JSON.stringify({ success: false, code: 2008, msg: 'command or value not support' })) : ok(true);
    }
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
    expect((await cloud.devices())[0]).toEqual({ id: DEVICE, name: 'Câmera Luiza', category: 'cdsxj', online: true });
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
      { TUYA_ACCESS_ID: 'id123', TUYA_ACCESS_SECRET: 'segredo', GO2RTC_PATH: '/nao/existe/go2rtc' },
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
      { TUYA_ACCESS_ID: 'id123', TUYA_ACCESS_SECRET: 'segredo', GO2RTC_PATH: '/nao/existe/go2rtc' },
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

  it('WebRTC (como o site): monta a fonte do go2rtc com o dono do aparelho', async () => {
    const cloud = new TuyaCloud('id123', 'segredo', 'https://openapi.tuyaus.com', fakeTuya([]));
    const src = new URL((await cloud.webrtcSource(DEVICE)).replace('tuya://', 'https://'));
    expect(src.host).toBe('openapi.tuyaus.com');
    expect(Object.fromEntries(src.searchParams)).toEqual({ device_id: DEVICE, uid: 'dono-da-conta', client_id: 'id123', client_secret: 'segredo' });
  });

  it.skipIf(!hasFfmpeg || !existsSync(GO2RTC))('go2rtc local: só em 127.0.0.1, configuração protegida e o ffmpeg lê o vídeo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'luna-g2r-'));
    const g = new Go2rtc(GO2RTC, dir, 18999);
    try {
      const url = await g.streamUrl('teste', 'ffmpeg:virtual?video&size=320x240#video=h264');
      expect(url).toBe('rtsp://127.0.0.1:18999/teste');
      expect(statSync(join(dir, 'go2rtc.json')).mode & 0o777).toBe(0o600);
      const r = spawnSync('ffmpeg', ['-hide_banner', '-rtsp_transport', 'tcp', '-timeout', '30000000', '-i', url, '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8', timeout: 40_000 });
      expect(r.status).toBe(0);
      expect(r.stderr).toMatch(/Video: h264/);
    } finally {
      g.stop();
    }
  }, 60_000);

  it.skipIf(!hasFfmpeg || !existsSync(GO2RTC))('com o go2rtc instalado, a primeira tentativa é WebRTC (pelo go2rtc local)', async () => {
    const seen: string[] = [];
    ctx = await makeApp(
      { TUYA_ACCESS_ID: 'id123', TUYA_ACCESS_SECRET: 'segredo', GO2RTC_PATH: GO2RTC },
      { login: true, tuyaFetch: fakeTuya([]), cameraInput: (url) => (seen.push(url), ['-re', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10']) },
    );
    const test = await ctx.inject('POST', '/api/cameras/direct/test', { url: `tuya://${DEVICE}`, transport: 'udp' });
    expect(test.json.ok).toBe(true);
    expect(test.json.detail).toMatch(/nuvem Tuya \(WEBRTC\)/);
    expect(seen[0]).toBe(`rtsp://127.0.0.1:18554/tuya_${DEVICE}`);
  }, 60_000);

  it.skipIf(!hasFfmpeg || !existsSync(GO2RTC))('go2rtc que sobrou de antes (porta ocupada): encerra o antigo ou usa outra porta', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'luna-g2r-'));
    // um go2rtc “esquecido” ocupando a porta, como no servidor
    const first = new Go2rtc(GO2RTC, dir, 18998);
    await first.streamUrl('velho', 'ffmpeg:virtual?video&size=320x240#video=h264');
    const orphanPid = Number(readFileSync(join(dir, 'go2rtc.pid'), 'utf8'));
    expect(existsSync(`/proc/${orphanPid}`)).toBe(true);
    // outra porta também ocupada por outro programa
    const blocker = createServer().listen(18997, '127.0.0.1');
    const g = new Go2rtc(GO2RTC, dir, 18997);
    try {
      const url = await g.streamUrl('teste', 'ffmpeg:virtual?video&size=320x240#video=h264');
      await new Promise((r) => setTimeout(r, 300));
      expect(existsSync(`/proc/${orphanPid}`) && !readFileSync(`/proc/${orphanPid}/stat`, 'utf8').includes(' Z ')).toBe(false); // o antigo foi encerrado
      expect(url).not.toContain(':18997/');
      const r = spawnSync('ffmpeg', ['-hide_banner', '-rtsp_transport', 'tcp', '-timeout', '30000000', '-i', url, '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8', timeout: 40_000 });
      expect(r.status).toBe(0);
    } finally {
      g.stop();
      first.stop();
      blocker.close();
    }
  }, 60_000);

  it('caixa de areia: limpa pela nuvem Tuya (o botão do HA parou de funcionar); se a nuvem falhar, tenta o HA', async () => {
    const calls: string[] = [];
    ctx = await makeApp({ TUYA_ACCESS_ID: 'id123', TUYA_ACCESS_SECRET: 'segredo', GO2RTC_PATH: '/nao/existe/go2rtc' }, { login: true, tuyaFetch: fakeTuya(calls) });
    const P = 'smart_cat_litter_box_ti';
    const add = (id: string, state: string) => ctx.ha.states.set(id, { entity_id: id, state, attributes: {} });
    add(`sensor.${P}_cat_weight`, '5.0');
    add(`sensor.${P}_excretion_times_day`, '0');
    add(`button.${P}_manual_clean`, 'unknown');
    expect((await ctx.inject('POST', `/api/litter/${P}/clean`)).status).toBe(200);
    // os dois caminhos da nuvem: propriedade do aparelho (como o app) e o comando padrão
    expect(calls.filter((c) => c.startsWith('comando') || c.startsWith('propriedade'))).toEqual([
      'propriedade {"properties":"{\\"manual_clean\\":true}"}',
      'comando {"commands":[{"code":"manual_clean","value":true}]}',
    ]);
    expect(ctx.ha.calls.filter((c) => c.domain === 'button')).toEqual([]);
    // diagnóstico para descobrir o comando que o app usa
    const info = (await ctx.inject('GET', '/api/litter/tuya-info')).json;
    expect(info.boxes[0].device.category).toBe('msp');
    expect(info.boxes[0].status).toContainEqual({ code: 'work_status', value: 'standby' });
    expect(info.boxes[0].functions.map((f: { code: string }) => f.code)).toContain('manual_clean');
    // nuvem recusou: aperta o botão do HA
    (globalThis as { __tuyaFail?: boolean }).__tuyaFail = true;
    try {
      expect((await ctx.inject('POST', `/api/litter/${P}/clean`)).status).toBe(200);
      expect(ctx.ha.calls.filter((c) => c.domain === 'button').map((c) => c.data.entity_id)).toEqual([`button.${P}_manual_clean`]);
    } finally {
      delete (globalThis as { __tuyaFail?: boolean }).__tuyaFail;
    }
  });
});
