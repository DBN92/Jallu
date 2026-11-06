import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerEvent } from '@luna/shared';
import { makeApp, type TestCtx } from './helpers';
import { WatchesService } from '../src/modules/watches/watches.service';
import { parseIntent } from '../src/modules/ai/nlu';

let hasFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hasFfmpeg = false;
}

/** Imagem sintética da “garagem”: fundo com listras + (opcional) um bloco escuro = carro, e faixa clara = portão aberto. */
function scene(opts: { car: boolean; gateOpen: boolean; bright?: number }) {
  const b = opts.bright ?? 0;
  const draws = [`drawbox=x=0:y=0:w=640:h=360:color=gray@1:t=fill`, `drawgrid=w=40:h=40:color=white@0.25`];
  if (opts.car) draws.push('drawbox=x=220:y=160:w=200:h=150:color=black@1:t=fill', 'drawbox=x=240:y=130:w=160:h=40:color=darkred@1:t=fill');
  draws.push(opts.gateOpen ? 'drawbox=x=0:y=0:w=640:h=90:color=white@1:t=fill' : 'drawbox=x=0:y=0:w=640:h=90:color=0x303030@1:t=fill');
  if (b) draws.push(`eq=brightness=${b}`);
  return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=640x360:d=1', '-vf', draws.join(','), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1']);
}

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('garagem: perguntas por voz', () => {
  it('entende perguntas sobre carro, portão e garagem sem confundir com comandos', () => {
    expect(parseIntent('Oi, Dia, o carro está na garagem?')).toMatchObject({ type: 'watch_status' });
    expect(parseIntent('o portão está aberto?')).toMatchObject({ type: 'watch_status' });
    expect(parseIntent('como está a garagem')).toMatchObject({ type: 'watch_status' });
    expect(parseIntent('acende a luz da garagem')).toMatchObject({ type: 'device_power' });
    expect(parseIntent('mostre a câmera da garagem')).toMatchObject({ type: 'show_camera' });
  });
});

describe.skipIf(!hasFfmpeg)('garagem: vigias por foto de referência', () => {
  it('aprende carro/portão pelas fotos, muda de estado com confirmação, registra eventos com foto e acende a luz à noite', async () => {
    ctx = await makeApp({}, { login: true });
    let frame = scene({ car: false, gateOpen: false });
    let now = new Date('2026-11-06T23:10:00-03:00'); // noite em São Paulo
    const events: ServerEvent[] = [];
    const db = (ctx.app as unknown as { db: never }).db;
    const svc = new WatchesService(db, () => 'ffmpeg', async () => frame, ctx.app.services.devices, (e) => events.push(e), mkdtempSync(join(tmpdir(), 'luna-ev-')), 'America/Sao_Paulo', () => now);

    const car = await svc.create({ kind: 'car', cameraId: 'camera.luna_garagem01', zone: { x: 0.25, y: 0.3, w: 0.5, h: 0.65 } });
    const gate = await svc.create({ kind: 'gate', cameraId: 'camera.luna_garagem01', zone: { x: 0, y: 0, w: 1, h: 0.25 } });
    expect(car).toMatchObject({ name: 'Carro', labelA: 'na garagem', labelB: 'fora' });
    expect(gate).toMatchObject({ name: 'Portão', labelA: 'fechado', labelB: 'aberto', alertMinutes: 10 });
    await svc.update(car.id, { lightEntity: 'light.luz_da_varanda', lightMinutes: 5 });

    // Fotos de referência: garagem vazia / com carro; portão fechado / aberto (+ uma de noite, mais escura)
    await svc.addRef(car.id, 'b');
    await svc.addRef(gate.id, 'a');
    frame = scene({ car: true, gateOpen: true });
    await svc.addRef(car.id, 'a');
    await svc.addRef(gate.id, 'b');
    frame = scene({ car: true, gateOpen: true, bright: -0.25 });
    await svc.addRef(car.id, 'a');
    expect((await svc.list()).find((w) => w.id === car.id)!.refs).toHaveLength(3);

    // Teste ao vivo
    frame = scene({ car: false, gateOpen: false, bright: -0.2 });
    const live = await svc.check(car.id);
    expect(live).toMatchObject({ ready: true, state: 'b', label: 'fora' });

    // Primeira leitura só registra o estado (sem aviso); precisa de 2 leituras iguais
    await svc.tick();
    expect((await svc.list()).find((w) => w.id === car.id)!.state).toBeNull();
    await svc.tick();
    expect((await svc.list()).find((w) => w.id === car.id)!.state).toBe('b');
    expect(events).toHaveLength(0);

    // Portão abre e carro entra (à noite) → eventos + luz acesa
    frame = scene({ car: true, gateOpen: true });
    await svc.tick();
    await svc.tick();
    const titles = events.map((e) => (e.type === 'camera_event' ? e.event.title : ''));
    expect(titles).toEqual(expect.arrayContaining(['Carro chegou na garagem', 'Portão abriu']));
    expect(ctx.ha.states.get('light.luz_da_varanda')?.state).toBe('on');

    // Eventos com foto
    const list = await svc.events(10);
    expect(list[0]!.photoUrl).toMatch(/^\/api\/camera-events\/.+\/photo$/);
    const photo = await svc.eventPhoto(list[0]!.id);
    expect(photo.subarray(0, 2).toString('hex')).toBe('ffd8');

    // Portão aberto há mais de 10 min → aviso
    now = new Date(now.getTime() + 12 * 60_000);
    await svc.tick();
    expect(events.some((e) => e.type === 'camera_event' && e.event.kind === 'alert' && /Portão aberto há 1\d min/.test(e.event.title))).toBe(true);

    // Resposta por voz
    expect(await svc.statusText('o carro está na garagem')).toBe('O carro está na garagem.');
    expect(await svc.statusText('o portão está aberto')).toMatch(/^O portão está aberto há 1\d minutos\.$/);
    expect(await svc.statusText('como está a garagem')).toMatch(/carro está na garagem e o portão está aberto/);
    svc.stop();
  }, 60_000);

  it('movimento à noite: avisa mudança grande, mas não de dia', async () => {
    ctx = await makeApp({}, { login: true });
    let frame = scene({ car: false, gateOpen: false });
    let now = new Date('2026-11-06T14:00:00-03:00');
    const events: ServerEvent[] = [];
    const db = (ctx.app as unknown as { db: never }).db;
    const svc = new WatchesService(db, () => 'ffmpeg', async () => frame, ctx.app.services.devices, (e) => events.push(e), mkdtempSync(join(tmpdir(), 'luna-ev-')), 'America/Sao_Paulo', () => now);
    await svc.create({ kind: 'motion', cameraId: 'camera.luna_garagem01' });
    await svc.tick();
    frame = scene({ car: true, gateOpen: true });
    await svc.tick();
    expect(events).toHaveLength(0); // de dia não avisa
    now = new Date('2026-11-06T02:00:00-03:00');
    frame = scene({ car: false, gateOpen: false });
    await svc.tick();
    expect(events.some((e) => e.type === 'camera_event' && e.event.kind === 'motion')).toBe(true);
    svc.stop();
  }, 60_000);
});

describe('garagem: rotas', () => {
  it('só admin configura; todos consultam', async () => {
    ctx = await makeApp();
    expect((await ctx.inject('POST', '/api/watches', { kind: 'carro', cameraId: 'camera.x' })).status).toBe(400);
    const w = await ctx.inject('POST', '/api/watches', { kind: 'gate', cameraId: 'camera.luna_abc12345' });
    expect(w.status).toBe(200);
    expect((await ctx.inject('GET', '/api/watches')).json).toHaveLength(1);
    expect((await ctx.inject('PATCH', `/api/watches/${w.json.id}`, { lightEntity: 'light.nao_existe' })).status).toBe(400);
    expect((await ctx.inject('GET', '/api/camera-events')).json).toEqual([]);
    expect((await ctx.inject('DELETE', `/api/watches/${w.json.id}`)).status).toBe(200);
  });
});
