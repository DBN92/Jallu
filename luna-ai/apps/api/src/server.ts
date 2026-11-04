import { APP_VERSION, loadDotEnv, loadEnv } from './config/env';
import { buildApp } from './app';

async function main() {
  loadDotEnv();
  const env = loadEnv();
  process.env.TZ = env.TZ;
  const app = await buildApp({ env });

  const shutdown = async (signal: string) => {
    app.log.info(`Recebido ${signal}, encerrando a Luna...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.LUNA_HOST, port: env.LUNA_PORT });
  app.log.info(`🌙 Luna AI ${APP_VERSION} ouvindo em http://${env.LUNA_HOST}:${env.LUNA_PORT}`);
}

main().catch((err) => {
  console.error('Falha ao iniciar a Luna AI:', err instanceof Error ? err.message : err);
  process.exit(1);
});
