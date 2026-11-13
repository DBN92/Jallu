import type { DeviceCategory, DeviceDto, VacuumExtras, VacuumInfo } from '@luna/shared';
import type { HaState } from '../../integrations/home-assistant/types';

/** Domínios exibidos no painel. */
export const SUPPORTED_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'climate', 'vacuum', 'sensor', 'binary_sensor'] as const;
/** Domínios que podem ser ligados/desligados (lista fechada — a IA não pode chamar outros serviços). */
export const CONTROLLABLE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean', 'climate', 'vacuum']);

/** Aspirador “ligado” = limpando (estados de robôs antigos usam on/off). */
const VACUUM_ON = new Set(['cleaning', 'on']);

/** Recursos do aspirador no Home Assistant (VacuumEntityFeature). */
const VF = { PAUSE: 4, STOP: 8, RETURN_HOME: 16, FAN_SPEED: 32, LOCATE: 512, START: 8192 };

const VACUUM_PHASE: Record<string, VacuumInfo['phase']> = { cleaning: 'cleaning', on: 'cleaning', docked: 'docked', returning: 'returning', paused: 'paused', idle: 'idle', off: 'idle', error: 'error' };
const PHASE_LABEL: Record<VacuumInfo['phase'], string> = {
  cleaning: 'Aspirando',
  docked: 'Na base',
  returning: 'Voltando para a base',
  paused: 'Pausado',
  idle: 'Parado',
  error: 'Precisa de ajuda',
  unknown: 'Sem informação',
};

/** Situação do aspirador a partir do estado do HA (bateria pode vir de um sensor separado). */
export function vacuumInfo(state: HaState, batterySensor?: number | null, extras: VacuumExtras | null = null, photo: number | null = null): VacuumInfo {
  const a = state.attributes;
  const phase = VACUUM_PHASE[state.state] ?? 'unknown';
  const feat = typeof a.supported_features === 'number' ? a.supported_features : 0;
  const rawBattery = typeof a.battery_level === 'number' ? a.battery_level : batterySensor ?? null;
  // Potência: do próprio aspirador ou, na Xiaomi Home, do seletor “modo” do aparelho
  const suction = extras?.controls.find((c) => c.key === 'suction');
  const nativeFans = Array.isArray(a.fan_speed_list) ? (a.fan_speed_list as unknown[]).filter((v): v is string => typeof v === 'string') : [];
  const fanSpeeds = nativeFans.length ? nativeFans : (suction?.options ?? []).map((o) => o.value);
  const locateExtra = extras?.controls.some((c) => c.key === 'locate') ?? false;
  const error = typeof a.error === 'string' && a.error ? a.error : null;
  return {
    status: phase === 'docked' && rawBattery !== null && rawBattery < 100 ? 'Carregando na base' : PHASE_LABEL[phase],
    phase,
    battery: rawBattery === null ? null : Math.max(0, Math.min(100, Math.round(rawBattery))),
    fanSpeed: typeof a.fan_speed === 'string' ? a.fan_speed : typeof suction?.value === 'string' ? suction.value : null,
    fanSpeeds,
    can: {
      pause: !feat || (feat & VF.PAUSE) > 0,
      stop: !feat || (feat & VF.STOP) > 0,
      locate: (feat & VF.LOCATE) > 0 || locateExtra,
      fanSpeed: ((feat & VF.FAN_SPEED) > 0 && nativeFans.length > 0) || !!suction,
      returnHome: !feat || (feat & VF.RETURN_HOME) > 0,
    },
    error,
    photo,
    extras,
  };
}

export const domainOf = (entityId: string) => entityId.split('.')[0] ?? '';

export function categorize(state: HaState): DeviceCategory {
  const domain = domainOf(state.entity_id);
  const dc = state.attributes.device_class;
  if (domain === 'light') return 'lighting';
  if (domain === 'switch') return dc === 'outlet' ? 'outlets' : 'switches';
  if (domain === 'input_boolean') return 'switches';
  if (domain === 'sensor' || domain === 'binary_sensor') return 'sensors';
  if (domain === 'climate' || domain === 'fan') return 'climate';
  if (domain === 'vacuum') return 'vacuum';
  return 'other';
}

const COLOR_MODES = new Set(['hs', 'rgb', 'rgbw', 'rgbww', 'xy']);
export function supportsColor(state: HaState): boolean {
  const modes = state.attributes.supported_color_modes;
  return domainOf(state.entity_id) === 'light' && Array.isArray(modes) && modes.some((m) => COLOR_MODES.has(String(m)));
}
function rgbOf(state: HaState): [number, number, number] | null {
  const c = state.attributes.rgb_color;
  return Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every((v) => typeof v === 'number') ? [c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, Math.round(v as number)))) as [number, number, number] : null;
}
export function supportsBrightness(state: HaState): boolean {
  if (domainOf(state.entity_id) !== 'light') return false;
  const modes = state.attributes.supported_color_modes;
  if (Array.isArray(modes)) return modes.some((m) => m !== 'onoff');
  return typeof state.attributes.brightness === 'number';
}

export function toDeviceDto(
  state: HaState,
  meta: { aiAllowed: boolean; aliases: string[]; hidden: boolean; customName?: string | null; battery?: number | null; extras?: VacuumExtras | null; photo?: number | null },
): DeviceDto {
  const domain = domainOf(state.entity_id);
  const available = !['unavailable', 'unknown'].includes(state.state);
  const controllable = CONTROLLABLE_DOMAINS.has(domain);
  const isOn = controllable ? (domain === 'climate' ? state.state !== 'off' : domain === 'vacuum' ? VACUUM_ON.has(state.state) : state.state === 'on') : null;
  const raw = state.attributes.brightness;
  const haName = (state.attributes.friendly_name as string | undefined) ?? state.entity_id;
  // A Xiaomi Home às vezes repete o nome do aparelho (“Rita Rita”)
  const cleanName = haName.replace(/^(.+?)\s+\1$/i, '$1');
  return {
    entityId: state.entity_id,
    domain,
    name: meta.customName || cleanName,
    originalName: cleanName,
    renamed: Boolean(meta.customName),
    category: categorize(state),
    state: state.state,
    available,
    isOn: available ? isOn : null,
    brightness: typeof raw === 'number' ? Math.round((raw / 255) * 100) : isOn === false ? 0 : null,
    supportsBrightness: supportsBrightness(state),
    supportsColor: supportsColor(state),
    rgb: rgbOf(state),
    controllable,
    unit: (state.attributes.unit_of_measurement as string | undefined) ?? null,
    deviceClass: (state.attributes.device_class as string | undefined) ?? null,
    aiAllowed: meta.aiAllowed,
    aliases: meta.aliases,
    hidden: meta.hidden,
    lastChanged: state.last_changed ?? null,
    vacuum: domain === 'vacuum' ? vacuumInfo(state, meta.battery, meta.extras ?? null, meta.photo ?? null) : null,
  };
}
