import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers';
import { parseRtspUrl, withCredentials } from '../src/modules/cameras/direct.service';

let hasFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hasFfmpeg = false;
}

// No lugar da câmera RTSP, uma imagem de teste gerada pelo próprio ffmpeg (mesmo caminho de conversão)
const synthetic = () => ['-re', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=15'];

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const raw = (url: string) => ctx.app.inject({ method: 'GET', url, headers: { cookie: ctx.cookies } });

describe('endereço RTSP', () => {
  it('separa usuário/senha do endereço e recodifica senhas com símbolos', () => {
    const p = parseRtspUrl('rtsp://admin:abc%2A1@192.168.15.112:554/onvif1');
    expect(p).toEqual({ url: 'rtsp://192.168.15.112:554/onvif1', username: 'admin', password: 'abc*1' });
    expect(withCredentials(p.url, 'admin', 'a@b#c*')).toBe('rtsp://admin:a%40b%23c*@192.168.15.112:554/onvif1');
    expect(() => parseRtspUrl('file:///etc/passwd')).toThrow(/rtsp/);
    expect(() => parseRtspUrl('http://192.168.15.112/x')).toThrow(/rtsp/);
  });
});

describe.skipIf(!hasFfmpeg)('câmeras diretas (Luna lê o RTSP com ffmpeg)', () => {
  it('cadastra sem expor a senha, substitui a câmera do HA de mesmo nome e entrega foto e vídeo HLS', async () => {
    ctx = await makeApp({}, { login: true, cameraInput: synthetic });
    ctx.ha.states.set('camera.entrada', { entity_id: 'camera.entrada', state: 'idle', attributes: { friendly_name: 'Entrada', supported_features: 2 } });

    expect((await ctx.inject('POST', '/api/cameras/direct', { name: 'Entrada', url: 'ftp://x', transport: 'udp' })).status).toBe(400);
    const created = await ctx.inject('POST', '/api/cameras/direct', { name: 'Entrada', url: 'rtsp://192.168.15.112:554/onvif1', username: 'admin', password: 'segredo*1', transport: 'udp' });
    expect(created.status).toBe(200);
    expect(JSON.stringify(created.json)).not.toContain('segredo');
    expect(created.json).toMatchObject({ name: 'Entrada', hasPassword: true, transport: 'udp' });

    const admin = await ctx.inject('GET', '/api/cameras/direct');
    expect(JSON.stringify(admin.json)).not.toContain('segredo');
    expect(admin.json.ffmpeg).toBe(true);

    const list = (await ctx.inject('GET', '/api/cameras')).json as { entityId: string; name: string; platform: string }[];
    expect(list.filter((c) => c.name === 'Entrada')).toHaveLength(1); // a do HA (que falhava) sai da lista
    const cam = list.find((c) => c.name === 'Entrada')!;
    expect(cam.platform).toBe('luna');
    expect(cam.entityId).toMatch(/^camera\.luna_/);

    const t = await ctx.inject('POST', '/api/cameras/direct/test', { url: 'rtsp://192.168.15.112:554/onvif1', transport: 'udp', id: created.json.id });
    expect(t.json.ok).toBe(true);

    const snap = await raw(`/api/cameras/${cam.entityId}/snapshot`);
    expect(snap.statusCode).toBe(200);
    expect(snap.headers['content-type']).toBe('image/jpeg');
    expect(snap.rawPayload.subarray(0, 2).toString('hex')).toBe('ffd8');

    const stream = await ctx.inject('POST', `/api/cameras/${cam.entityId}/stream`);
    expect(stream.status).toBe(200);
    const playlist = await ctx.app.inject({ method: 'GET', url: stream.json.url });
    expect(playlist.statusCode).toBe(200);
    expect(playlist.body).toContain('#EXTM3U');
    const seg = playlist.body.split('\n').find((l) => l.endsWith('.ts'))!;
    const segRes = await ctx.app.inject({ method: 'GET', url: stream.json.url.replace('index.m3u8', seg) });
    expect(segRes.statusCode).toBe(200);
    expect(segRes.headers['content-type']).toBe('video/mp2t');

    // Caminhos fora da sessão são recusados
    expect((await ctx.app.inject({ method: 'GET', url: stream.json.url.replace('index.m3u8', 'latest.jpg') })).statusCode).toBe(404);
    expect((await ctx.inject('POST', `/api/cameras/${cam.entityId}/ptz`, { action: 'left' })).status).toBe(400);

    const diag = await ctx.inject('GET', `/api/cameras/${cam.entityId}/diagnose`);
    expect(diag.json.steps.every((s: { ok: boolean }) => s.ok)).toBe(true);

    expect((await ctx.inject('DELETE', `/api/cameras/direct/${created.json.id}`)).status).toBe(200);
    const after = (await ctx.inject('GET', '/api/cameras')).json as { platform: string }[];
    expect(after.some((c) => c.platform === 'luna')).toBe(false);
  }, 60_000);
});
