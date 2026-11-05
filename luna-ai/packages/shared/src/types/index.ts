export type AiMode = 'local' | 'cloud' | 'hybrid';
export type AiProviderName = 'ollama' | 'openai' | 'luna-nlu';
export type UserRole = 'admin' | 'member';

export type AssistantState = 'idle' | 'listening' | 'processing' | 'acting' | 'speaking' | 'error';

export type DeviceCategory = 'lighting' | 'switches' | 'outlets' | 'sensors' | 'climate' | 'other';

export const DEVICE_CATEGORY_LABELS: Record<DeviceCategory, string> = {
  lighting: 'Iluminação',
  switches: 'Interruptores',
  outlets: 'Tomadas',
  sensors: 'Sensores',
  climate: 'Climatização',
  other: 'Outros',
};

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface DeviceDto {
  entityId: string;
  domain: string;
  /** Nome exibido: o personalizado na Luna, ou o do Home Assistant */
  name: string;
  /** Nome original no Home Assistant */
  originalName: string;
  /** true quando o usuário renomeou na Luna */
  renamed: boolean;
  category: DeviceCategory;
  state: string;
  available: boolean;
  isOn: boolean | null;
  /** 0–100 quando suportado */
  brightness: number | null;
  supportsBrightness: boolean;
  controllable: boolean;
  unit: string | null;
  deviceClass: string | null;
  aiAllowed: boolean;
  aliases: string[];
  hidden: boolean;
  lastChanged: string | null;
}

export interface ActionResult {
  tool: string;
  ok: boolean;
  summary: string;
  entityIds?: string[];
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  reply: string;
  provider: AiProviderName;
  model: string | null;
  actions: ActionResult[];
  /** Avisos não fatais (ex.: "OpenAI indisponível, usei o modelo local"). */
  notices: string[];
}

export interface ConversationSummaryDto {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  channel: string;
  createdAt: string;
}

export interface MemoryDto {
  id: string;
  type: 'preference' | 'fact' | 'home' | 'context' | 'summary';
  content: string;
  source: string;
  createdAt: string;
}

export interface CurrentWeather {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  condition: string;
  windSpeed: number;
  isDay: boolean;
}

export interface HourlyWeather {
  time: string;
  temperature: number;
  precipitationProbability: number;
  weatherCode: number;
  condition: string;
}

export interface DailyWeather {
  date: string;
  min: number;
  max: number;
  precipitationProbability: number;
  precipitationSum: number;
  weatherCode: number;
  condition: string;
  sunrise: string;
  sunset: string;
}

export interface WeatherDto {
  location: { latitude: number; longitude: number; name: string | null; timezone: string };
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  fetchedAt: string;
  cached: boolean;
}

export interface SettingsDto {
  aiMode: AiMode;
  voiceName: string | null;
  voiceRate: number;
  autoSpeak: boolean;
  realtimeVoice: string;
  allowCloudMemory: boolean;
  allowCloudTranscription: boolean;
  wakeWordEnabled: boolean;
  homeLocation: { name: string; latitude: number; longitude: number } | null;
}

export interface ServiceHealth {
  ok: boolean;
  detail: string;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  /** Uso do servidor (porcentagens 0–100) */
  system?: { cpuPercent: number; memoryPercent: number; memoryUsedGb: number; memoryTotalGb: number; serverUptimeHours: number };
  services: {
    database: ServiceHealth;
    homeAssistant: ServiceHealth & { websocket: boolean };
    ollama: ServiceHealth & { model: string };
    openai: ServiceHealth & { configured: boolean; model: string };
  };
}

export type AutomationStatus = 'draft' | 'active' | 'disabled' | 'error';

export interface AutomationRuleDto {
  id: string;
  name: string;
  description: string;
  status: AutomationStatus;
  haAutomationId: string | null;
  haEntityId: string | null;
  /** Estado real lido do Home Assistant (on/off), quando existir */
  haState: string | null;
  definition: unknown;
  lastError: string | null;
  createdAt: string;
}

export interface ActionLogDto {
  id: string;
  source: string;
  tool: string;
  target: string | null;
  success: boolean;
  detail: string | null;
  createdAt: string;
}

/** Eventos enviados pelo servidor via WebSocket. */
export type ServerEvent =
  | { type: 'hello'; user: PublicUser }
  | { type: 'device_state'; device: DeviceDto }
  | { type: 'devices_reload' }
  | { type: 'ha_status'; connected: boolean }
  | { type: 'assistant_state'; state: AssistantState; conversationId?: string };

export interface CameraDto {
  entityId: string;
  name: string;
  state: string;
  available: boolean;
  /** Vídeo ao vivo disponível (HLS via Home Assistant) */
  stream: boolean;
  /** Controle de movimento (ONVIF): girar, inclinar, zoom */
  ptz: boolean;
  /** Integração de origem no HA (ex.: onvif, generic) */
  platform: string | null;
}

export type PtzAction = 'up' | 'down' | 'left' | 'right' | 'zoom_in' | 'zoom_out' | 'stop';
