import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';
import { readCpuTemperature } from '../src/routes/health.routes';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('status do sistema (carrossel da tela inicial)', () => {
  it('lê a temperatura do processador (coretemp) ou devolve null', async () => {
    const root = mkdtempSync(join(tmpdir(), 'luna-sys-'));
    mkdirSync(join(root, 'hwmon', 'hwmon0'), { recursive: true });
    mkdirSync(join(root, 'hwmon', 'hwmon1'), { recursive: true });
    writeFileSync(join(root, 'hwmon', 'hwmon0', 'name'), 'acpitz\n');
    writeFileSync(join(root, 'hwmon', 'hwmon0', 'temp1_input'), '30000\n');
    writeFileSync(join(root, 'hwmon', 'hwmon1', 'name'), 'coretemp\n');
    writeFileSync(join(root, 'hwmon', 'hwmon1', 'temp1_input'), '54000\n');
    expect(await readCpuTemperature(root)).toBe(54);
    expect(await readCpuTemperature(mkdtempSync(join(tmpdir(), 'luna-empty-')))).toBeNull();
  });

  it('detalhes trazem o último pedido do usuário e o acesso externo', async () => {
    ctx = await makeApp();
    await chat(ctx, 'que horas são?');
    const h = await ctx.inject('GET', '/api/health/details');
    expect(h.json.lastCommand).toMatchObject({ text: 'que horas são?', channel: 'text' });
    expect(h.json.publicAccess).toEqual({ configured: false, ok: false });
    expect(h.json.system).toHaveProperty('temperatureC');
  });
});
