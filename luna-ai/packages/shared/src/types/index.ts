export type AiMode = 'local' | 'cloud' | 'hybrid';
export type AiProviderName = 'ollama' | 'openai' | 'luna-nlu';
export type UserRole = 'admin' | 'member';

export type AssistantState = 'idle' | 'listening' | 'processing' | 'acting' | 'speaking' | 'error';

export type DeviceCategory = 'lighting' | 'switches' | 'outlets' | 'sensors' | 'climate' | 'vacuum' | 'other';

export const DEVICE_CATEGORY_LABELS: Record<DeviceCategory, string> = {
  lighting: 'Iluminação',
  switches: 'Interruptores',
  outlets: 'Tomadas',
  sensors: 'Sensores',
  climate: 'Climatização',
  vacuum: 'Aspiradores',
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
  /** Nome exibido: o personalizado na DIA, ou o do Home Assistant */
  name: string;
  /** Nome original no Home Assistant */
  originalName: string;
  /** true quando o usuário renomeou na DIA */
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
  /** Só para aspiradores robôs (domínio vacuum) */
  vacuum?: VacuumInfo | null;
}

/** Comandos aceitos pelos aspiradores (lista fechada). */
export type VacuumCommand = 'start' | 'pause' | 'stop' | 'return_to_base' | 'locate' | 'set_fan_speed';

export interface VacuumInfo {
  /** Situação em português (ex.: “Aspirando”, “Na base”) */
  status: string;
  /** cleaning | docked | returning | paused | idle | error (estado do Home Assistant) */
  phase: 'cleaning' | 'docked' | 'returning' | 'paused' | 'idle' | 'error' | 'unknown';
  /** Bateria 0–100, quando o robô informa */
  battery: number | null;
  /** Potência de sucção atual e opções */
  fanSpeed: string | null;
  fanSpeeds: string[];
  /** O que este robô sabe fazer (depende da marca/integração) */
  can: { pause: boolean; stop: boolean; locate: boolean; fanSpeed: boolean; returnHome: boolean };
  /** Mensagem de erro do robô, se houver */
  error: string | null;
  /** Foto enviada pelo usuário (versão para evitar cache), ou null para usar o desenho */
  photo: number | null;
  /** Opções extras que a integração do robô oferece (ex.: Xiaomi Home) */
  extras: VacuumExtras | null;
}

export interface VacuumOption {
  value: string;
  label: string;
}

/** Controle extra do robô. id = entity_id da entidade acessória (validado no servidor). */
export interface VacuumControl {
  id: string;
  /** suction | water | carpet | resume | child_lock | dnd | mop_wash | dry_start | dry_stop | dust | locate | reset_main_brush | reset_side_brush | reset_filter | reset_mop */
  key: string;
  label: string;
  kind: 'choice' | 'toggle' | 'action';
  value?: string | boolean | null;
  options?: VacuumOption[];
  hint?: string;
}

export interface VacuumConsumable {
  key: 'main_brush' | 'side_brush' | 'filter' | 'mop';
  label: string;
  percent: number;
  hoursLeft: number | null;
  /** id do controle de zerar a contagem, se houver */
  resetId: string | null;
}

export interface VacuumExtras {
  controls: VacuumControl[];
  consumables: VacuumConsumable[];
  stats: { lastArea: number | null; lastMinutes: number | null; totalArea: number | null; totalCount: number | null; totalMinutes: number | null };
  /** Pano secando: minutos restantes */
  dryingMinutes: number | null;
  charging: string | null;
  /** Agendamentos feitos no app do fabricante, em texto (ex.: “07:00 todos os dias”) */
  schedules: string[];
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
  system?: { cpuPercent: number; memoryPercent: number; memoryUsedGb: number; memoryTotalGb: number; serverUptimeHours: number; temperatureC?: number | null };
  /** Acesso de fora de casa (endereço público, ex.: Cloudflare Tunnel) */
  publicAccess?: { configured: boolean; ok: boolean };
  /** Último pedido feito à DIA por este usuário */
  lastCommand?: { text: string; at: string; channel: string } | null;
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
  | { type: 'assistant_state'; state: AssistantState; conversationId?: string }
  /** Resposta da DIA (enviada a todas as telas do usuário — a TV mostra o que foi pedido pelo celular) */
  | { type: 'assistant_reply'; userText: string; reply: string; cameraIds: string[] }
  /** Acontecimento numa câmera vigiada (garagem): mudança de estado, aviso ou movimento à noite */
  | { type: 'camera_event'; event: CameraEventDto };

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

/** Gestos reconhecidos (nomes do reconhecedor de mãos, em minúsculas). */
export const GESTURES = ['open_palm', 'closed_fist', 'thumb_up', 'thumb_down', 'victory', 'pointing_up', 'i_love_you'] as const;
export type GestureName = (typeof GESTURES)[number];
export const GESTURE_LABELS: Record<GestureName, { emoji: string; label: string }> = {
  open_palm: { emoji: '✋', label: 'Mão aberta' },
  closed_fist: { emoji: '✊', label: 'Punho fechado' },
  thumb_up: { emoji: '👍', label: 'Polegar para cima' },
  thumb_down: { emoji: '👎', label: 'Polegar para baixo' },
  victory: { emoji: '✌️', label: 'Dois dedos (paz)' },
  pointing_up: { emoji: '☝️', label: 'Indicador para cima' },
  i_love_you: { emoji: '🤟', label: 'Te amo (🤟)' },
};

export interface GestureRuleDto {
  id: string;
  gesture: GestureName;
  /** "device" = câmera do próprio aparelho; senão, entity_id da câmera */
  source: string;
  action: 'turn_on' | 'turn_off' | 'toggle';
  /** entity_id ou "all_lights" */
  target: string;
  enabled: boolean;
}

/** Vigia visual (ex.: garagem: carro dentro/fora, portão aberto/fechado, movimento à noite). */
export interface WatchDto {
  id: string;
  name: string;
  kind: 'car' | 'gate' | 'motion' | 'custom';
  cameraId: string;
  zone: { x: number; y: number; w: number; h: number } | null;
  labelA: string;
  labelB: string;
  enabled: boolean;
  state: 'a' | 'b' | null;
  stateLabel: string | null;
  stateSince: string | null;
  confidence: number | null;
  lightEntity: string | null;
  lightMinutes: number;
  alertMinutes: number | null;
  refs: { id: string; state: 'a' | 'b'; thumb: string; createdAt: string }[];
}

export interface CameraEventDto {
  id: string;
  cameraId: string;
  watchId: string | null;
  kind: 'state' | 'alert' | 'motion';
  title: string;
  photoUrl: string | null;
  createdAt: string;
}
