import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dayPath, folderName, recordArgs, RecordingsService } from '../src/modules/recordings/recordings.service';

const services: RecordingsService[] = [];
afterEach(() => services.splice(0).forEach((s) => s.stop()));

describe('gravação das câmeras', () => {
  it('pasta da câmera pelo nome e arquivos em ano/mês/dia sem recomprimir o vídeo', () => {
    expect(folderName('Garagem', 'camera.x')).toBe('Garagem');
    expect(folderName('Babá: Luiza/Quarto', 'camera.x')).toBe('Babá Luiza Quarto');
    expect(folderName('..', 'camera.quintal')).toBe('quintal');
    const a = recordArgs(['-i', 'rtsp://cam'], '/DATA/Gravacoes', 'Garagem');
    expect(a.join(' ')).toContain('-c:v copy');
    expect(a.join(' ')).toContain('-strftime 1');
    expect(a.at(-1)).toBe('/DATA/Gravacoes/Garagem/%Y/%m/%d/%H-%M-%S.mp4');
  });

  it('liga/desliga por câmera (fica salvo) e grava com o ffmpeg', async () => {
    const data = mkdtempSync(join(tmpdir(), 'rec-data-'));
    const dir = join(mkdtempSync(join(tmpdir(), 'rec-')), 'Gravacoes');
    // ffmpeg de mentira: guarda os argumentos e fica rodando
    const fake = join(data, 'ffmpeg');
    writeFileSync(fake, `#!/bin/sh\necho "$@" > "${data}/args"\nexec sleep 30\n`);
    chmodSync(fake, 0o755);
    const cams = [
      { entityId: 'camera.garagem', name: 'Garagem', stream: true, platform: 'onvif' },
      { entityId: 'camera.web_x', name: 'Site', stream: false, platform: 'web' },
    ] as never[];
    const deps = { ffmpeg: () => fake, input: async () => ['-i', 'rtsp://cam'], cameras: async () => cams, tz: 'America/Sao_Paulo' };
    const s = new RecordingsService(data, dir, deps);
    services.push(s);
    const st = await s.setEnabled('camera.garagem', true);
    expect(st.cameras.find((c) => c.entityId === 'camera.garagem')).toMatchObject({ enabled: true, status: 'gravando', folder: 'Garagem' });
    expect(st.cameras.find((c) => c.entityId === 'camera.web_x')).toMatchObject({ supported: false, enabled: false });
    await new Promise((r) => setTimeout(r, 300));
    expect(readdirSync(data).includes('args')).toBe(true);
    // pastas de hoje e de amanhã já criadas (o ffmpeg não cria pastas)
    expect(existsSync(join(dir, 'Garagem', dayPath(new Date(), 'America/Sao_Paulo')))).toBe(true);
    expect(dayPath(new Date(Date.UTC(2026, 10, 21, 1, 30)), 'America/Sao_Paulo')).toBe(join('2026', '11', '20'));
    // outra instância lê o que ficou salvo
    const s2 = new RecordingsService(data, dir, { ...deps, ffmpeg: () => null });
    expect((await s2.status()).cameras.find((c) => c.entityId === 'camera.garagem')?.enabled).toBe(true);
    const off = await s.setEnabled('camera.garagem', false);
    expect(off.cameras.find((c) => c.entityId === 'camera.garagem')?.status).toBe('desligada');
  });

  it('apaga os dias com mais de 7 dias e mantém os recentes', async () => {
    const data = mkdtempSync(join(tmpdir(), 'rec-data-'));
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    for (const d of ['2026/11/01', '2026/11/12', '2026/11/13', '2026/11/20']) {
      mkdirSync(join(dir, 'Garagem', d), { recursive: true });
      writeFileSync(join(dir, 'Garagem', d, '10-00-00.mp4'), 'x');
    }
    mkdirSync(join(dir, 'Garagem', '2026', '10', '30'), { recursive: true });
    const s = new RecordingsService(data, dir, { ffmpeg: () => null, input: async () => null, cameras: async () => [], tz: 'UTC', freeRatio: async () => 0.5 });
    const r = await s.cleanup(new Date(2026, 10, 20, 12));
    expect(r.removed.length).toBe(3);
    expect(existsSync(join(dir, 'Garagem', '2026', '11', '13'))).toBe(true);
    expect(existsSync(join(dir, 'Garagem', '2026', '11', '12'))).toBe(false);
    expect(existsSync(join(dir, 'Garagem', '2026', '10'))).toBe(false); // mês vazio some
  });

  it('com o disco quase cheio, apaga os dias mais antigos (nunca o de hoje)', async () => {
    const data = mkdtempSync(join(tmpdir(), 'rec-data-'));
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    for (const d of ['2026/11/18', '2026/11/19', '2026/11/20']) mkdirSync(join(dir, 'Garagem', d), { recursive: true });
    let free = 0.05;
    const s = new RecordingsService(data, dir, { ffmpeg: () => null, input: async () => null, cameras: async () => [], tz: 'UTC', freeRatio: async () => (free += 0.03) - 0.03 });
    const r = await s.cleanup(new Date(2026, 10, 20, 12));
    expect(r.removed.map((p) => p.slice(-10))).toEqual(['2026/11/18', '2026/11/19']);
    expect(existsSync(join(dir, 'Garagem', '2026', '11', '20'))).toBe(true);
  });
});
