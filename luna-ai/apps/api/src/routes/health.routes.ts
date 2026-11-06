import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { HealthDto } from '@luna/shared';
import { APP_VERSION } from '../config/env';
import { requireAuth } from '../middleware/auth';

/** Temperatura do processador (°C) pelo Linux (coretemp/hwmon ou thermal_zone); null se não houver. */
export async function readCpuTemperature(root = '/sys/class'): Promise<number | null> {
  const { readdir, readFile } = await import('node:fs/promises');
  const read = (f: string) => readFile(f, 'utf8').then((v) => v.trim()).catch(() => null);
  const temps: number[] = [];
  for (const d of await readdir(`${root}/hwmon`).catch(() => [] as string[])) {
    const name = await read(`${root}/hwmon/${d}/name`);
    if (name && /coretemp|k10temp|zenpower|cpu_thermal/.test(name)) {
      const t = Number(await read(`${root}/hwmon/${d}/temp1_input`));
      if (t > 0) temps.push(t / 1000);
    }
  }
  if (!temps.length) {
    for (const d of await readdir(`${root}/thermal`).catch(() => [] as string[])) {
      if (!d.startsWith('thermal_zone')) continue;
      const type = (await read(`${root}/thermal/${d}/type`)) ?? '';
      const t = Number(await read(`${root}/thermal/${d}/temp`));
      if (t > 0 && /x86_pkg|cpu|soc|acpitz/i.test(type)) temps.push(t / 1000);
    }
  }
  return temps.length ? Math.round(Math.max(...temps)) : null;
}

let publicCache: { at: number; ok: boolean } | null = null;

export async function healthRoutes(app: FastifyInstance) {
  /** O endereço público (Cloudflare Tunnel) responde? Consulta no máximo 1x por minuto. */
  const publicAccess = async () => {
    const url = app.env.LUNA_PUBLIC_URL;
    if (!url) return { configured: false, ok: false };
    if (!publicCache || Date.now() - publicCache.at > 60_000) {
      const ok = await fetch(`${url.replace(/\/+$/, '')}/api/health`, { signal: AbortSignal.timeout(5000) })
        .then((r) => r.ok)
        .catch(() => false);
      publicCache = { at: Date.now(), ok };
    }
    return { configured: true, ok: publicCache.ok };
  };

  /** Verificação mínima (pública) para scripts/monitoramento: não expõe detalhes. */
  app.get('/api/health', async () => ({ status: 'ok', version: APP_VERSION }));

  /** Diagnóstico completo das integrações (requer login). */
  app.get('/api/health/details', { preHandler: requireAuth }, async (req): Promise<HealthDto> => {
    const { ha, haWs, ollama, openai } = app.services;
    const [temperatureC, pub, lastMsg] = await Promise.all([
      readCpuTemperature().catch(() => null),
      publicAccess(),
      app.db.message.findFirst({ where: { role: 'user', conversation: { userId: req.user!.id } }, orderBy: { createdAt: 'desc' }, select: { content: true, createdAt: true, channel: true } }).catch(() => null),
    ]);
    const [db, haRes, ollamaRes, openaiRes] = await Promise.all([
      app.db.$queryRaw`SELECT 1`.then(() => ({ ok: true, detail: 'SQLite ok' })).catch((e: Error) => ({ ok: false, detail: e.message })),
      ha.configured
        ? ha.ping().then(() => ({ ok: true, detail: 'Conectado' })).catch((e: Error) => ({ ok: false, detail: e.message }))
        : Promise.resolve({ ok: false, detail: 'HA_URL/HA_TOKEN não configurados' }),
      ollama.status(),
      openai.status(),
    ]);
    const services = {
      database: db,
      homeAssistant: { ...haRes, websocket: haWs.connected },
      ollama: { ...ollamaRes, model: ollama.model },
      openai: { ...openaiRes, configured: openai.isConfigured(), model: openai.model },
    };
    // Uso do servidor: carga média de 1 min / núcleos e memória (MemAvailable no Linux)
    const cpus = os.cpus().length || 1;
    const total = os.totalmem();
    let available = os.freemem();
    try {
      const mi = (await import('node:fs')).readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/);
      if (mi) available = Number(mi[1]) * 1024;
    } catch {
      /* não-Linux */
    }
    const system = {
      cpuPercent: Math.min(100, Math.round((os.loadavg()[0]! / cpus) * 100)),
      memoryPercent: Math.round(((total - available) / total) * 100),
      memoryUsedGb: Math.round(((total - available) / 1024 ** 3) * 10) / 10,
      memoryTotalGb: Math.round((total / 1024 ** 3) * 10) / 10,
      serverUptimeHours: Math.round(os.uptime() / 360) / 10,
      temperatureC,
    };
    return {
      system,
      status: db.ok && haRes.ok && (ollamaRes.ok || openaiRes.ok) ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      services,
      publicAccess: pub,
      lastCommand: lastMsg ? { text: lastMsg.content.slice(0, 120), at: lastMsg.createdAt.toISOString(), channel: lastMsg.channel } : null,
    };
  });
}
