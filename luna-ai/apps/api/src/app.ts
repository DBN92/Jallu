import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { VacuumPhotos } from './modules/devices/vacuum-photos';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import type { Env } from './config/env';
import { createDb, type Db } from './lib/db';
import { AppError } from './lib/errors';
import { HomeAssistantRestClient } from './integrations/home-assistant/rest-client';
import { HomeAssistantWsClient } from './integrations/home-assistant/ws-client';
import { OllamaProvider } from './integrations/ollama/ollama.provider';
import { OpenAIProvider } from './integrations/openai/openai.provider';
import { OpenAIVoiceClient } from './integrations/openai/realtime.client';
import { AuthService } from './modules/auth/auth.service';
import { authRoutes } from './modules/auth/auth.routes';
import { ActionLogService } from './modules/devices/action-log.service';
import { DevicesService } from './modules/devices/devices.service';
import { deviceRoutes } from './modules/devices/devices.routes';
import { WeatherService } from './modules/weather/weather.service';
import { weatherRoutes } from './modules/weather/weather.routes';
import { MemoryService } from './modules/memory/memory.service';
import { memoryRoutes } from './modules/memory/memory.routes';
import { SettingsService } from './modules/settings/settings.service';
import { locationRoutes, settingsRoutes } from './modules/settings/settings.routes';
import { AutomationsService } from './modules/automations/automations.service';
import { automationRoutes } from './modules/automations/automations.routes';
import { ToolExecutor } from './modules/ai/tools';
import { ChatService } from './modules/ai/chat.service';
import { aiRoutes } from './modules/ai/ai.routes';
import { voiceRoutes } from './modules/voice/voice.routes';
import { CamerasService } from './modules/cameras/cameras.service';
import { cameraRoutes } from './modules/cameras/cameras.routes';
import { DirectCamerasService, type InputArgs } from './modules/cameras/direct.service';
import { GesturesService } from './modules/gestures/gestures.service';
import { gestureRoutes } from './modules/gestures/gestures.routes';
import { WatchesService } from './modules/watches/watches.service';
import { watchRoutes } from './modules/watches/watches.routes';
import { siriRoutes } from './modules/siri/siri.routes';
import { LitterService } from './modules/litter/litter.service';
import { litterRoutes } from './modules/litter/litter.routes';
import { WasherService } from './modules/washer/washer.service';
import { washerRoutes } from './modules/washer/washer.routes';
import { houseRoutes } from './modules/house/house.routes';
import { androidRoutes } from './modules/android/android.routes';
import { SiriService } from './modules/siri/siri.service';
import { healthRoutes } from './routes/health.routes';
import { RealtimeHub, wsRoutes } from './routes/ws.routes';

type FetchLike = typeof fetch;

export interface AppDeps {
  env: Env;
  db?: Db;
  /** fetch usado pelas integrações externas (substituível em testes) */
  fetch?: { ha?: FetchLike; ollama?: FetchLike; openai?: FetchLike; weather?: FetchLike };
  /** Desativa a conexão WebSocket com o HA (testes) */
  disableHaWs?: boolean;
  /** Entrada do ffmpeg das câmeras diretas (testes usam uma fonte sintética no lugar do RTSP) */
  cameraInput?: InputArgs;
  /** Testes: foto das câmeras para os vigias e caminho do ffmpeg */
  watchFrame?: (cameraId: string) => Promise<Buffer>;
  watchFfmpeg?: string | null;
  /** Não iniciar as leituras periódicas (testes chamam tick() direto) */
  disableWatchTimer?: boolean;
}

function buildServices(env: Env, db: Db, deps: AppDeps, log: FastifyInstance['log']) {
  const ha = new HomeAssistantRestClient(env.HA_URL, env.HA_TOKEN, deps.fetch?.ha);
  const haWs = new HomeAssistantWsClient(env.HA_URL, env.HA_TOKEN, { info: (m) => log.info(m), warn: (m) => log.warn(m) });
  const actionLogs = new ActionLogService(db);
  const devices = new DevicesService(db, ha, actionLogs, env.LUNA_AI_AUTO_AUTHORIZE_DOMAINS);
  const weather = new WeatherService(
    { forecastUrl: env.OPEN_METEO_URL, geocodingUrl: env.OPEN_METEO_GEOCODING_URL, cacheMinutes: env.WEATHER_CACHE_MINUTES },
    deps.fetch?.weather,
  );
  const memory = new MemoryService(db);
  const settings = new SettingsService(db, env.LUNA_AI_MODE);
  const automations = new AutomationsService(db, ha, devices, actionLogs);
  const keepAlive = /^-?\d+$/.test(env.OLLAMA_KEEP_ALIVE) ? Number(env.OLLAMA_KEEP_ALIVE) : env.OLLAMA_KEEP_ALIVE;
  const ollama = new OllamaProvider(env.OLLAMA_URL, env.OLLAMA_MODEL, env.OLLAMA_TIMEOUT_MS, deps.fetch?.ollama, keepAlive);
  const openai = new OpenAIProvider(env.OPENAI_BASE_URL, env.OPENAI_API_KEY, env.OPENAI_MODEL, env.OPENAI_TIMEOUT_MS, deps.fetch?.openai);
  const voice = new OpenAIVoiceClient(env.OPENAI_BASE_URL, env.OPENAI_API_KEY, env.OPENAI_REALTIME_MODEL, env.OPENAI_TRANSCRIBE_MODEL, deps.fetch?.openai);
  const tools = new ToolExecutor(devices, weather, memory, settings, automations, env.TZ);
  const hub = new RealtimeHub();
  const cameras = new CamerasService(
    ha,
    actionLogs,
    () => (haWs.connected ? haWs.registry() : Promise.resolve(new Map())),
    (payload) => haWs.command(payload),
  );
  const chat = new ChatService(db, { ollama, openai }, tools, devices, weather, memory, settings, env.TZ, (userId, state, conversationId) =>
    hub.toUser(userId, { type: 'assistant_state', state, conversationId }),
  );
  const auth = new AuthService(db, { setupCode: env.LUNA_SETUP_CODE, sessionTtlHours: env.LUNA_SESSION_TTL_HOURS });

  const directCameras = new DirectCamerasService(db, env.FFMPEG_PATH, deps.cameraInput);
  cameras.setDirect(directCameras);
  const gestures = new GesturesService(db, devices);
  // Vigias da garagem: foto da câmera direta (1 quadro) ou do Home Assistant
  const frame = deps.watchFrame ??
    (async (cameraId: string) => (cameraId.startsWith('camera.luna_') ? directCameras.frameJpeg(cameraId) : Buffer.from(await (await cameras.snapshot(cameraId)).arrayBuffer())));
  const dataDir = env.DATABASE_URL.startsWith('file:') ? dirname(env.DATABASE_URL.slice(5)) : '.';
  const vacuumPhotos = new VacuumPhotos(dataDir, devices);
  void vacuumPhotos.init();
  const watches = new WatchesService(db, () => (deps.watchFfmpeg !== undefined ? deps.watchFfmpeg : directCameras.ffmpegPath()), frame, devices, (e) => hub.broadcast(e), dataDir, env.TZ);
  chat.setCameras(cameras);
  chat.setWatches(watches);
  chat.setReplyListener((userId, r) => hub.toUser(userId, { type: 'assistant_reply', ...r }));
  // Caixa de areia: entidades com cartão próprio (ficam fora da lista de aparelhos)
  const litter = new LitterService(db, ha, actionLogs, env.TZ);
  chat.setLitter(litter);
  litter.on('update', () => hub.broadcast({ type: 'litter_update' }));
  litter.on('alert', (text: string) => hub.broadcast({ type: 'litter_alert', text }));
  // Lava e seca: cartão próprio e aviso “Roupa pronta!” em todas as telas
  const washer = new WasherService(db, ha, actionLogs, env.TZ);
  chat.setWasher(washer);
  washer.on('update', () => hub.broadcast({ type: 'washer_update' }));
  washer.on('done', (e: { text: string; speech: string; speak: boolean }) => hub.broadcast({ type: 'washer_done', ...e }));
  devices.setHiddenProvider(async () => {
    const [ha1, box, wash] = await Promise.all([
      haWs.connected ? haWs.hiddenEntities() : Promise.resolve(new Set<string>()),
      litter.entityIds().catch(() => new Set<string>()),
      washer.entityIds().catch(() => new Set<string>()),
    ]);
    return new Set([...ha1, ...box, ...wash]);
  });
  devices.setRegistryProvider(() => (haWs.connected ? haWs.registry() : Promise.resolve(new Map())));
  devices.on('state', (device) => hub.broadcast({ type: 'device_state', device }));
  devices.on('reload', () => hub.broadcast({ type: 'devices_reload' }));
  haWs.on('state_changed', (evt) => {
    devices.handleStateChanged(evt);
    void litter.handleStateChanged(evt).catch(() => undefined);
    void washer.handleStateChanged(evt).catch(() => undefined);
  });
  haWs.on('connected', () => {
    hub.broadcast({ type: 'ha_status', connected: true });
    devices.refresh(true).then(() => hub.broadcast({ type: 'devices_reload' })).catch(() => undefined);
  });
  haWs.on('disconnected', () => hub.broadcast({ type: 'ha_status', connected: false }));

  return { db, litter, washer, siri: new SiriService(db, chat), ha, haWs, actionLogs, devices, vacuumPhotos, cameras, directCameras, gestures, watches, weather, memory, settings, automations, ollama, openai, voice, tools, hub, chat, auth };
}

export type Services = ReturnType<typeof buildServices>;

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    db: Db;
    services: Services;
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env } = deps;
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL, redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'] },
    trustProxy: env.LUNA_TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });
  const db = deps.db ?? createDb(env.DATABASE_URL);
  app.decorate('env', env);
  app.decorate('db', db);
  app.decorate('services', buildServices(env, db, deps, app.log));
  app.decorateRequest('user', null);
  app.decorateRequest('sessionCsrf', null);

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        // 'wasm-unsafe-eval': permite só WebAssembly (reconhecedor de gestos local), não eval de JS
        'script-src': ["'self'", "'wasm-unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
        'connect-src': ["'self'", 'https://api.openai.com', 'wss:', 'ws:'],
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: false, // HTTPS/HSTS é tratado pelo Cloudflare
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Permissions-Policy', 'microphone=(self), geolocation=(self), camera=(self)');
  });
  // Sem lista de exceções: atrás do cloudflared todo tráfego chega de 127.0.0.1.
  // O Cloudflare define CF-Connecting-IP com o IP real do cliente (não falsificável via Cloudflare).
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Arquivos do app (JS, CSS, fontes, ícones) não contam: o limite protege a API (login incluso)
    allowList: (req) => !req.url.startsWith('/api/') && !req.url.startsWith('/ws'),
    keyGenerator: (req) => {
      const cf = req.headers['cf-connecting-ip'];
      return typeof cf === 'string' && cf.length < 64 ? `cf:${cf}` : req.ip;
    },
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.status(400).send({ error: 'validation', message: `Dados inválidos${first ? ` (${first.path.join('.') || 'corpo'}: ${first.message})` : ''}.` });
    }
    if (err instanceof AppError) return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    const e = err as { statusCode?: number; message: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: 'rate_limited', message: 'Muitas requisições. Aguarde um pouco e tente novamente.' });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: 'request', message: e.message });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Erro interno no servidor da Luna.' });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(deviceRoutes);
  await app.register(weatherRoutes);
  await app.register(memoryRoutes);
  await app.register(settingsRoutes);
  await app.register(locationRoutes);
  await app.register(automationRoutes);
  await app.register(aiRoutes);
  await app.register(voiceRoutes);
  await app.register(cameraRoutes);
  await app.register(gestureRoutes);
  await app.register(watchRoutes);
  await app.register(siriRoutes);
  await app.register(litterRoutes);
  await app.register(washerRoutes);
  await app.register(houseRoutes);
  await app.register(androidRoutes, { distDir: env.LUNA_ANDROID_DIST ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../android/dist') });
  await app.register(wsRoutes);

  // Frontend (PWA) servido pela própria API → um único serviço para o Cloudflare Tunnel
  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = env.LUNA_WEB_DIST ?? resolve(here, '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders: (res, path) => {
        if (path.endsWith('sw.js') || path.endsWith('index.html') || path.endsWith('.webmanifest')) res.header('Cache-Control', 'no-cache');
        else if (path.includes('/assets/')) res.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
    app.get('/*', (req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) return reply.status(404).send({ error: 'not_found', message: 'Rota não encontrada.' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.log.warn(`Frontend não encontrado em ${webDist}. Rode "npm run build" para gerar o PWA.`);
  }

  app.addHook('onReady', async () => {
    if (!deps.disableWatchTimer && env.NODE_ENV !== 'test') {
      app.services.watches.start();
      app.services.litter.start();
    }
    if (!deps.disableHaWs) app.services.haWs.start();
    // Aquece o modelo local em segundo plano (tenta por até ~10 min, enquanto o Ollama sobe)
    if (env.NODE_ENV !== 'test') {
      let tries = 0;
      const attempt = () => {
        app.services.chat
          .warmup()
          .then((ok) => {
            if (ok) app.log.info('Modelo local aquecido e pronto.');
            else if (++tries < 20) setTimeout(attempt, 30_000);
          })
          .catch(() => (++tries < 20 ? setTimeout(attempt, 30_000) : undefined));
      };
      setTimeout(attempt, 2_000);
    }
  });
  app.addHook('onClose', async () => {
    app.services.haWs.stop();
    app.services.watches.stop();
    app.services.litter.stop();
    await app.services.directCameras.close();
    await db.$disconnect();
  });

  return app;
}
