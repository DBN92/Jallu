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
import { WebCamerasService } from './modules/cameras/web.service';
import { TuyaCloud } from './integrations/tuya/cloud';
import { Go2rtc } from './integrations/go2rtc/go2rtc';
import { GesturesService } from './modules/gestures/gestures.service';
import { gestureRoutes } from './modules/gestures/gestures.routes';
import { WatchesService } from './modules/watches/watches.service';
import { watchRoutes } from './modules/watches/watches.routes';
import { siriRoutes } from './modules/siri/siri.routes';
import { tvRoutes } from './modules/tv/tv.routes';
import { TvDuckService } from './modules/tv/tv-duck.service';
import { TvPanelService } from './modules/tv/tv-panel.service';
import { CatPhotos } from './modules/litter/cat-photos';
import { RecordingsService } from './modules/recordings/recordings.service';
import { recordingsRoutes } from './modules/recordings/recordings.routes';
import { LitterService } from './modules/litter/litter.service';
import { litterRoutes } from './modules/litter/litter.routes';
import { WasherService } from './modules/washer/washer.service';
import { washerRoutes } from './modules/washer/washer.routes';
import { houseRoutes } from './modules/house/house.routes';
import { photosRoutes } from './modules/photos/photos.routes';
import { recadosRoutes } from './modules/recados/recados.routes';
import { listsRoutes } from './modules/lists/lists.routes';
import { pushRoutes } from './modules/push/push.routes';
import { ttsRoutes } from './modules/tts/tts.routes';
import { diagRoutes } from './modules/diag/diag.routes';
import { peopleRoutes } from './modules/people/people.routes';
import { PeopleService } from './modules/people/people.service';
import { PiperTts } from './modules/tts/piper.service';
import { PushService } from './modules/push/push.service';
import { ListsService } from './modules/lists/lists.service';
import { RecadosService } from './modules/recados/recados.service';
import { PhotoAlbum } from './modules/photos/photos.service';
import { androidRoutes } from './modules/android/android.routes';
import { SiriService } from './modules/siri/siri.service';
import { healthRoutes } from './routes/health.routes';
import { RealtimeHub, wsRoutes } from './routes/ws.routes';

type FetchLike = typeof fetch;

export interface AppDeps {
  env: Env;
  db?: Db;
  /** fetch usado pelas integrações externas (substituível em testes) */
  fetch?: { ha?: FetchLike; ollama?: FetchLike; openai?: FetchLike; weather?: FetchLike; tuya?: FetchLike };
  /** Desativa a conexão WebSocket com o HA (testes) */
  disableHaWs?: boolean;
  /** Entrada do ffmpeg das câmeras diretas (testes usam uma fonte sintética no lugar do RTSP) */
  cameraInput?: InputArgs;
  /** Testes: foto das câmeras para os vigias e caminho do ffmpeg */
  watchFrame?: (cameraId: string) => Promise<Buffer>;
  watchFfmpeg?: string | null;
  /** Não iniciar as leituras periódicas (testes chamam tick() direto) */
  disableWatchTimer?: boolean;
  /** Testes: intervalo para conferir a caixa depois da limpeza manual (padrão 20 s) */
  litterRestoreMs?: number;
  /** Testes: envio das notificações push (no lugar do serviço do celular) */
  pushSender?: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
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
  // IA na nuvem: Groq (rápido, com plano grátis) quando houver GROQ_API_KEY; senão a OpenAI
  const groq = !!env.GROQ_API_KEY;
  const openai = groq
    ? new OpenAIProvider(env.GROQ_BASE_URL, env.GROQ_API_KEY, env.GROQ_MODEL, env.OPENAI_TIMEOUT_MS, deps.fetch?.openai, {
        label: 'Groq',
        // gpt-oss pensa antes de responder: pouco pensamento = resposta mais rápida
        extraBody: /gpt-oss/i.test(env.GROQ_MODEL) ? { reasoning_effort: 'low' } : {},
      })
    : new OpenAIProvider(env.OPENAI_BASE_URL, env.OPENAI_API_KEY, env.OPENAI_MODEL, env.OPENAI_TIMEOUT_MS, deps.fetch?.openai);
  const voice = new OpenAIVoiceClient(
    env.OPENAI_BASE_URL,
    env.OPENAI_API_KEY,
    env.OPENAI_REALTIME_MODEL,
    env.OPENAI_TRANSCRIBE_MODEL,
    deps.fetch?.openai,
    groq ? { baseUrl: env.GROQ_BASE_URL, apiKey: env.GROQ_API_KEY, model: env.GROQ_TRANSCRIBE_MODEL, label: 'Groq' } : null,
  );
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
  chat.hybridLocalMs = env.LUNA_HYBRID_LOCAL_TIMEOUT_MS;
  const auth = new AuthService(db, { setupCode: env.LUNA_SETUP_CODE, sessionTtlHours: env.LUNA_SESSION_TTL_HOURS });

  const directCameras = new DirectCamerasService(db, env.FFMPEG_PATH, deps.cameraInput);
  cameras.setDirect(directCameras);
  const dataDir = env.DATABASE_URL.startsWith('file:') ? dirname(env.DATABASE_URL.slice(5)) : '.';
  // Nuvem Tuya: vídeo de câmeras Smart Life que o Home Assistant não suporta (ex.: babá eletrônica)
  const tuya = new TuyaCloud(env.TUYA_ACCESS_ID, env.TUYA_ACCESS_SECRET, env.TUYA_ENDPOINT.replace(/\/+$/, ''), deps.fetch?.tuya);
  // WebRTC (como o site/app) pelo go2rtc local quando instalado; depois RTSP e HLS direto da nuvem
  const go2rtc = new Go2rtc(env.GO2RTC_PATH, dataDir);
  directCameras.setTuyaStream(
    async (id, kind) => (kind === 'webrtc' ? go2rtc.streamUrl(`tuya_${id}`, await tuya.webrtcSource(id)) : tuya.streamUrl(id, kind)),
    () => (go2rtc.available ? ['webrtc', 'rtsp', 'hls'] : ['rtsp', 'hls']),
    () => go2rtc.lastError(),
  );
  const gestures = new GesturesService(db, devices);
  // Vigias da garagem: foto da câmera direta (1 quadro) ou do Home Assistant
  const frame = deps.watchFrame ??
    (async (cameraId: string) => (cameraId.startsWith('camera.luna_') ? directCameras.frameJpeg(cameraId) : Buffer.from(await (await cameras.snapshot(cameraId)).arrayBuffer())));
  const vacuumPhotos = new VacuumPhotos(dataDir, devices);
  const webCameras = new WebCamerasService(dataDir);
  // Silencia a TV escolhida enquanto a Luna escuta (o microfone misturava a TV com o pedido)
  const tvDuck = new TvDuckService(ha, dataDir);
  const tvPanel = new TvPanelService(db, devices, dataDir);
  // Gravação das câmeras: vídeo contínuo em Câmera/ano/mês/dia, 7 dias
  const recordings = new RecordingsService(dataDir, env.RECORDINGS_DIR || (existsSync('/DATA') ? '/DATA/Gravacoes' : resolve(dataDir, 'gravacoes')), {
    ffmpeg: () => directCameras.ffmpegPath(),
    input: (id) => cameras.recordInput(id),
    cameras: () => cameras.list(),
    tz: env.TZ,
    log: (m) => log.info(m),
  });
  cameras.setWeb(webCameras);
  void vacuumPhotos.init();
  const watches = new WatchesService(db, () => (deps.watchFfmpeg !== undefined ? deps.watchFfmpeg : directCameras.ffmpegPath()), frame, devices, (e) => hub.broadcast(e), dataDir, env.TZ);
  chat.setCameras(cameras);
  chat.setWatches(watches);
  chat.setReplyListener((userId, r) => hub.toUser(userId, { type: 'assistant_reply', ...r }));
  // Recados em vídeo (gravados na tela; a voz avisa e abre)
  const push = new PushService(db, dataDir, deps.pushSender, env.LUNA_PUBLIC_URL, (m) => console.warn(m));
  const recados = new RecadosService(dataDir, () => hub.broadcast({ type: 'recados_update' }));
  // Recado novo: aviso no celular de todos da casa (menos no aparelho que gravou)
  recados.onAdded = (r, exceptEndpoint) =>
    void push.broadcast({ title: 'Recado novo', body: `${r.fromName} deixou um recado em vídeo.`, url: `/?recado=${r.id}`, tag: `recado-${r.id}` }, { exceptEndpoint }).catch(() => undefined);
  chat.setRecados(recados);
  // Lista da casa (em casa / comprar) e notas
  const lists = new ListsService(db, () => hub.broadcast({ type: 'lists_update' }));
  chat.setLists(lists);
  // Quem está em casa (pessoas do Home Assistant)
  const people = new PeopleService(db, ha, devices, env.TZ);
  chat.setPeople(people);
  people.on('update', () => hub.broadcast({ type: 'people_update' }));
  cameras.notify = (title, body) => void push.broadcast({ title, body, url: '/cameras', tag: 'camera-alerta' }).catch(() => undefined);
  people.notify = (title, body) => void push.broadcast({ title, body, url: '/', tag: 'pessoas' }).catch(() => undefined);
  // Caixa de areia: entidades com cartão próprio (ficam fora da lista de aparelhos)
  const litter = new LitterService(db, ha, actionLogs, env.TZ);
  const catPhotos = new CatPhotos(dataDir);
  litter.catPhoto = (id) => catPhotos.version(id);
  // Caixa de areia pela nuvem Tuya (o botão do HA parou de funcionar para o modelo); acha o aparelho
  // (categoria msp) e o comando de limpeza manual que ele mesmo informa
  if (tuya.configured) {
    // Caixa de areia pela nuvem Tuya, com os comandos que o próprio aparelho declara no modelo dele.
    // Neste modelo: “clean” (limpeza manual), “induction_clean” (automática) e “induction_delay” (espera,
    // em minutos); os “manual_clean/auto_clean/delay_clean_time” que o HA usa vêm marcados “não usado”.
    type Box = { id: string; clean: string; auto: string | null; delay: { code: string; minutes: boolean; max: number } | null };
    let box: Box | null = null;
    const find = async (): Promise<Box> => {
      if (box) return box;
      for (const d of (await tuya.devices()).filter((x) => x.category === 'msp' || /litter|areia|caixa/i.test(x.name))) {
        const props = await tuya.propertyCodes(d.id).catch(() => [] as string[]);
        const has = (c: string) => props.includes(c);
        const clean = has('clean') ? 'clean' : has('manual_clean') ? 'manual_clean' : null;
        if (!clean) continue;
        const auto = has('induction_clean') ? 'induction_clean' : has('auto_clean') ? 'auto_clean' : null;
        const delay = has('induction_delay') ? { code: 'induction_delay', minutes: true, max: 60 } : has('delay_clean_time') ? { code: 'delay_clean_time', minutes: false, max: 600 } : null;
        box = { id: d.id, clean, auto, delay };
        return box;
      }
      throw new Error('não achei a caixa de areia na conta ligada à nuvem Tuya');
    };
    /**
     * Depois da limpeza manual: acompanha a caixa (a cada 20 s, até 8 min) e, quando ela parar de limpar,
     * religa a limpeza automática se a caixa a tiver desligado.
     */
    const restoreStep = deps.litterRestoreMs ?? 20_000;
    const restoreAuto = (id: string, autoCode: string) => {
      let tries = 0;
      const check = async () => {
        tries++;
        const st = await tuya.status(id).catch(() => [] as { code: string; value: unknown }[]);
        const cleaning = st.find((x) => x.code === 'status')?.value === 'clean';
        if (cleaning && tries < 24) return void setTimeout(() => void check(), restoreStep).unref?.();
        const now = await tuya.getProperties(id, [autoCode]).catch(() => ({}) as Record<string, unknown>);
        if (now[autoCode] === false) {
          await tuya.setProperty(id, autoCode, true).then(
            () => console.warn('[caixa de areia] limpeza manual terminou: limpeza automática religada'),
            (e: Error) => console.warn(`[caixa de areia] não consegui religar a limpeza automática: ${e.message}`),
          );
        }
        litter.cloudChanged();
      };
      setTimeout(() => void check(), restoreStep).unref?.();
    };
    litter.cloud = {
      clean: async () => {
        const b = await find();
        // Como no app Smart Life: se a automática estava ligada, volta a ficar ligada depois da limpeza manual
        const wasAuto = b.auto ? (await tuya.getProperties(b.id, [b.auto]).catch(() => ({}) as Record<string, unknown>))[b.auto] === true : false;
        await tuya.setProperty(b.id, b.clean, true);
        if (b.auto && wasAuto) restoreAuto(b.id, b.auto);
        return `propriedade ${b.clean}${wasAuto ? ' (automática volta ao terminar)' : ''}`;
      },
      setAuto: async (on, delaySeconds) => {
        const b = await find();
        if (!b.auto) throw new Error('a caixa não informa limpeza automática');
        if (delaySeconds !== undefined && b.delay) {
          const v = b.delay.minutes ? Math.max(0, Math.min(b.delay.max, Math.round(delaySeconds / 60))) : Math.max(1, Math.min(b.delay.max, Math.round(delaySeconds)));
          await tuya.setProperty(b.id, b.delay.code, v);
        }
        await tuya.setProperty(b.id, b.auto, on);
        return `propriedade ${b.auto}${delaySeconds !== undefined && b.delay ? ` + ${b.delay.code}` : ''}`;
      },
      autoState: async () => {
        const b = await find();
        if (!b.auto) return null;
        const v = await tuya.getProperties(b.id, [b.auto, ...(b.delay ? [b.delay.code] : [])]);
        if (typeof v[b.auto] !== 'boolean') return null;
        const d = b.delay ? Number(v[b.delay.code]) : NaN;
        return {
          on: v[b.auto] as boolean,
          delaySeconds: Number.isFinite(d) ? (b.delay!.minutes ? d * 60 : d) : null,
          delayMax: b.delay ? (b.delay.minutes ? b.delay.max * 60 : b.delay.max) : 600,
        };
      },
    };
  }

  chat.setLitter(litter);
  litter.on('update', () => hub.broadcast({ type: 'litter_update' }));
  litter.on('alert', (text: string) => hub.broadcast({ type: 'litter_alert', text }));
  // Lava e seca: cartão próprio e aviso “Roupa pronta!” em todas as telas
  const washer = new WasherService(db, ha, actionLogs, env.TZ);
  // Aviso “todos saíram”: a lava e seca ligada também entra na lista
  people.extraOn = async () => (await washer.list()).filter((w) => w.power && (w.status === 'start' || w.status === 'pause')).map((w) => w.name);
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
    void people.handleStateChanged(evt).catch(() => undefined);
    void cameras.handleStateChanged(evt).catch(() => undefined);
  });
  haWs.on('connected', () => {
    hub.broadcast({ type: 'ha_status', connected: true });
    devices.refresh(true).then(() => hub.broadcast({ type: 'devices_reload' })).catch(() => undefined);
  });
  haWs.on('disconnected', () => hub.broadcast({ type: 'ha_status', connected: false }));

  const piper = new PiperTts({ bin: env.PIPER_PATH, model: env.PIPER_MODEL, lengthScale: env.PIPER_LENGTH_SCALE }, (m) => console.warn(m));
  const siri = new SiriService(db, chat);
  // Voz da resposta começa a ser gerada assim que a resposta sai; hora e clima ficam prontos antes da pergunta
  siri.onAnswer = (text) => {
    if (piper.available) void piper.speak(text).catch(() => undefined);
  };
  if (!deps.disableWatchTimer) siri.startPrewarm((t) => piper.speak(t), () => piper.available, env.TZ);
  return { db, litter, catPhotos, washer, siri, ha, haWs, actionLogs, devices, vacuumPhotos, photos: new PhotoAlbum(dataDir), recados, lists, push, people, piper, cameras, directCameras, webCameras, tuya, go2rtc, tvDuck, tvPanel, recordings, gestures, watches, weather, memory, settings, automations, ollama, openai, voice, tools, hub, chat, auth };
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
  await app.register(tvRoutes);
  await app.register(litterRoutes);
  await app.register(washerRoutes);
  await app.register(houseRoutes);
  await app.register(photosRoutes);
  await app.register(recordingsRoutes);
  await app.register(recadosRoutes);
  await app.register(listsRoutes);
  await app.register(pushRoutes);
  await app.register(ttsRoutes);
  await app.register(diagRoutes);
  await app.register(peopleRoutes);
  await app.register(androidRoutes, { distDir: env.LUNA_ANDROID_DIST ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../android/dist'), dataDir: env.DATABASE_URL.startsWith('file:') ? dirname(env.DATABASE_URL.slice(5)) : '.' });
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
    // Gravações: espera o Home Assistant e o go2rtc subirem
    if (env.NODE_ENV !== 'test') setTimeout(() => void app.services.recordings.start().catch((e) => app.log.warn(`gravação: ${(e as Error).message}`)), 20_000).unref();
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
    app.services.recordings.stop();
    app.services.go2rtc.stop();
    app.services.haWs.stop();
    app.services.watches.stop();
    app.services.litter.stop();
    app.services.piper.stop();
    app.services.siri.stopPrewarm();
    await app.services.directCameras.close();
    await db.$disconnect();
  });

  return app;
}
