import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Raiz do projeto (luna-ai/), tanto em src/ (dev) quanto em dist/ (produção). */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', ...(import.meta.url.includes('/src/config/') ? ['..'] : []));

/** Carrega o .env da raiz (ou LUNA_ENV_FILE) sem sobrescrever variáveis já definidas. */
export function loadDotEnv() {
  const file = process.env.LUNA_ENV_FILE ?? resolve(PROJECT_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Converte "file:./data/luna.db" em caminho absoluto relativo à raiz do projeto. */
export function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const path = url.slice(5);
  return isAbsolute(path) ? url : `file:${resolve(PROJECT_ROOT, path)}`;
}

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LUNA_HOST: z.string().default('0.0.0.0'),
  LUNA_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LUNA_PUBLIC_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  LUNA_TRUST_PROXY: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1).default('file:./data/luna.db'),

  LUNA_SETUP_CODE: z.string().default(''),
  LUNA_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 365).default(720),
  LUNA_COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),

  HA_URL: z.string().default('http://127.0.0.1:8123'),
  HA_TOKEN: z.string().default(''),
  LUNA_AI_AUTO_AUTHORIZE_DOMAINS: z.string().default('light'),

  OLLAMA_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:3b'),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().default(300_000),
  /** Tempo que o modelo fica carregado na RAM (-1 = sempre, recomendado em CPU). */
  OLLAMA_KEEP_ALIVE: z.string().default('-1'),

  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime'),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('gpt-4o-mini-transcribe'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().default(60_000),

  LUNA_AI_MODE: z.enum(['local', 'cloud', 'hybrid']).default('hybrid'),
  /** Modo híbrido: segundos (em ms) que o modelo local tem para começar a responder antes de passar para a OpenAI */
  LUNA_HYBRID_LOCAL_TIMEOUT_MS: z.coerce.number().int().min(3000).default(20_000),

  OPEN_METEO_URL: z.string().default('https://api.open-meteo.com/v1/forecast'),
  OPEN_METEO_GEOCODING_URL: z.string().default('https://geocoding-api.open-meteo.com/v1/search'),
  WEATHER_CACHE_MINUTES: z.coerce.number().min(0).default(10),
  TZ: z.string().default('America/Sao_Paulo'),

  LUNA_WEB_DIST: z.string().optional(),
  /** Pasta com o APK do app Android (padrão: apps/android/dist do repositório) */
  LUNA_ANDROID_DIST: z.string().optional(),
  /** ffmpeg para câmeras diretas (RTSP). Vazio = runtime/ffmpeg/ffmpeg ou o do sistema. */
  FFMPEG_PATH: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida no .env:\n${issues}`);
  }
  const env = parsed.data;
  env.HA_URL = env.HA_URL.replace(/\/+$/, '');
  env.OLLAMA_URL = env.OLLAMA_URL.replace(/\/+$/, '');
  env.OPENAI_BASE_URL = env.OPENAI_BASE_URL.replace(/\/+$/, '');
  env.DATABASE_URL = resolveDatabaseUrl(env.DATABASE_URL);
  return env;
}

export const APP_VERSION = '0.1.0';
