import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { HealthDto } from '@luna/shared';
import { APP_VERSION } from '../config/env';
import { requireAuth } from '../middleware/auth';

export async function healthRoutes(app: FastifyInstance) {
  /** Verificação mínima (pública) para scripts/monitoramento: não expõe detalhes. */
  app.get('/api/health', async () => ({ status: 'ok', version: APP_VERSION }));

  /** Diagnóstico completo das integrações (requer login). */
  app.get('/api/health/details', { preHandler: requireAuth }, async (): Promise<HealthDto> => {
    const { ha, haWs, ollama, openai } = app.services;
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
    };
    return {
      system,
      status: db.ok && haRes.ok && (ollamaRes.ok || openaiRes.ok) ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      services,
    };
  });
}
