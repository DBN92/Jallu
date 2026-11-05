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

/** Câmera ONVIF falsa: confere o digest WS-Security e registra os movimentos. */
async function fakeOnvif(password: string) {
  const { createServer } = await import('node:http');
  const { createHash } = await import('node:crypto');
  const moves: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const reply = (xml: string, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/soap+xml' });
        res.end(`<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>${xml}</s:Body></s:Envelope>`);
      };
      if (body.includes('GetSystemDateAndTime')) {
        const d = new Date();
        return reply(`<tds:GetSystemDateAndTimeResponse><tt:UTCDateTime><tt:Time><tt:Hour>${d.getUTCHours()}</tt:Hour><tt:Minute>${d.getUTCMinutes()}</tt:Minute><tt:Second>${d.getUTCSeconds()}</tt:Second></tt:Time><tt:Date><tt:Year>${d.getUTCFullYear()}</tt:Year><tt:Month>${d.getUTCMonth() + 1}</tt:Month><tt:Day>${d.getUTCDate()}</tt:Day></tt:Date></tt:UTCDateTime></tds:GetSystemDateAndTimeResponse>`);
      }
      const nonce = body.match(/<wsse:Nonce[^>]*>([^<]+)</)?.[1];
      const created = body.match(/<wsu:Created>([^<]+)</)?.[1];
      const digest = body.match(/<wsse:Password[^>]*>([^<]+)</)?.[1];
      const expected = nonce && created ? createHash('sha1').update(Buffer.concat([Buffer.from(nonce, 'base64'), Buffer.from(created), Buffer.from(password)])).digest('base64') : '';
      if (!digest || digest !== expected) return reply('<s:Fault><s:Reason><s:Text>Sender not Authorized</s:Text></s:Reason></s:Fault>', 400);
      if (body.includes('GetCapabilities'))
        return reply('<tds:Capabilities><tt:Media><tt:XAddr>http://10.9.9.9:5000/onvif/media_service</tt:XAddr></tt:Media><tt:PTZ><tt:XAddr>http://10.9.9.9:5000/onvif/ptz_service</tt:XAddr></tt:PTZ></tds:Capabilities>');
      if (body.includes('GetProfiles')) return reply('<trt:GetProfilesResponse><trt:Profiles token="Profile_1" fixed="true"><tt:Name>main</tt:Name></trt:Profiles></trt:GetProfilesResponse>');
      if (body.includes('ContinuousMove')) {
        const pt = body.match(/<PanTilt[^>]*x="([^"]+)" y="([^"]+)"/);
        moves.push(`${req.url}|${body.match(/<ProfileToken>([^<]+)</)?.[1]}|move ${pt?.[1]},${pt?.[2]}`);
        return reply('<tptz:ContinuousMoveResponse/>');
      }
      if (body.includes('<Stop')) {
        moves.push('stop');
        return reply('<tptz:StopResponse/>');
      }
      reply('<s:Fault/>', 500);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { port: (server.address() as { port: number }).port, moves, close: () => server.close() };
}

describe('movimento das câmeras diretas (ONVIF pela Luna)', () => {
  it('detecta a porta, autentica com digest e gira/para a câmera', async () => {
    const cam = await fakeOnvif('segredo*1');
    try {
      ctx = await makeApp();
      const created = await ctx.inject('POST', '/api/cameras/direct', { name: 'Entrada', url: 'rtsp://127.0.0.1:554/onvif1', username: 'admin', password: 'errada', transport: 'udp' });
      const bad = await ctx.inject('POST', `/api/cameras/direct/${created.json.id}/onvif`, { port: cam.port });
      expect(bad.json.ok).toBe(false);
      expect(bad.json.detail).toMatch(/senha/);

      await ctx.inject('PATCH', `/api/cameras/direct/${created.json.id}`, { password: 'segredo*1' });
      const ok = await ctx.inject('POST', `/api/cameras/direct/${created.json.id}/onvif`, { port: cam.port });
      expect(ok.json).toMatchObject({ ok: true, port: cam.port });

      const entityId = `camera.luna_${created.json.id}`;
      const list = (await ctx.inject('GET', '/api/cameras')).json as { entityId: string; ptz: boolean }[];
      expect(list.find((c) => c.entityId === entityId)?.ptz).toBe(true);

      expect((await ctx.inject('POST', `/api/cameras/${entityId}/ptz`, { action: 'left' })).status).toBe(200);
      expect((await ctx.inject('POST', `/api/cameras/${entityId}/ptz`, { action: 'up' })).status).toBe(200);
      expect((await ctx.inject('POST', `/api/cameras/${entityId}/ptz`, { action: 'stop' })).status).toBe(200);
      // O endereço devolvido pela câmera (10.9.9.9) é corrigido para o IP/porta reais
      expect(cam.moves).toEqual(['/onvif/ptz_service|Profile_1|move -0.6,0', '/onvif/ptz_service|Profile_1|move 0,0.6', 'stop']);
    } finally {
      cam.close();
    }
  });
});
