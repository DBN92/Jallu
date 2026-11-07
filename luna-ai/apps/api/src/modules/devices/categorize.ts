import type { DeviceCategory, DeviceDto, VacuumInfo } from '@luna/shared';
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
export function vacuumInfo(state: HaState, batterySensor?: number | null): VacuumInfo {
  const a = state.attributes;
  const phase = VACUUM_PHASE[state.state] ?? 'unknown';
  const feat = typeof a.supported_features === 'number' ? a.supported_features : 0;
  const rawBattery = typeof a.battery_level === 'number' ? a.battery_level : batterySensor ?? null;
  const fanSpeeds = Array.isArray(a.fan_speed_list) ? (a.fan_speed_list as unknown[]).filter((v): v is string => typeof v === 'string') : [];
  const error = typeof a.error === 'string' && a.error ? a.error : null;
  return {
    status: phase === 'docked' && rawBattery !== null && rawBattery < 100 ? 'Carregando na base' : PHASE_LABEL[phase],
    phase,
    battery: rawBattery === null ? null : Math.max(0, Math.min(100, Math.round(rawBattery))),
    fanSpeed: typeof a.fan_speed === 'string' ? a.fan_speed : null,
    fanSpeeds,
    can: {
      pause: !feat || (feat & VF.PAUSE) > 0,
      stop: !feat || (feat & VF.STOP) > 0,
      locate: (feat & VF.LOCATE) > 0,
      fanSpeed: (feat & VF.FAN_SPEED) > 0 && fanSpeeds.length > 0,
      returnHome: !feat || (feat & VF.RETURN_HOME) > 0,
    },
    error,
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

export function supportsBrightness(state: HaState): boolean {
  if (domainOf(state.entity_id) !== 'light') return false;
  const modes = state.attributes.supported_color_modes;
  if (Array.isArray(modes)) return modes.some((m) => m !== 'onoff');
  return typeof state.attributes.brightness === 'number';
}

export function toDeviceDto(
  state: HaState,
  meta: { aiAllowed: boolean; aliases: string[]; hidden: boolean; customName?: string | null; battery?: number | null },
): DeviceDto {
  const domain = domainOf(state.entity_id);
  const available = !['unavailable', 'unknown'].includes(state.state);
  const controllable = CONTROLLABLE_DOMAINS.has(domain);
  const isOn = controllable ? (domain === 'climate' ? state.state !== 'off' : domain === 'vacuum' ? VACUUM_ON.has(state.state) : state.state === 'on') : null;
  const raw = state.attributes.brightness;
  return {
    entityId: state.entity_id,
    domain,
    name: meta.customName || ((state.attributes.friendly_name as string | undefined) ?? state.entity_id),
    originalName: (state.attributes.friendly_name as string | undefined) ?? state.entity_id,
    renamed: Boolean(meta.customName),
    category: categorize(state),
    state: state.state,
    available,
    isOn: available ? isOn : null,
    brightness: typeof raw === 'number' ? Math.round((raw / 255) * 100) : isOn === false ? 0 : null,
    supportsBrightness: supportsBrightness(state),
    controllable,
    unit: (state.attributes.unit_of_measurement as string | undefined) ?? null,
    deviceClass: (state.attributes.device_class as string | undefined) ?? null,
    aiAllowed: meta.aiAllowed,
    aliases: meta.aliases,
    hidden: meta.hidden,
    lastChanged: state.last_changed ?? null,
    vacuum: domain === 'vacuum' ? vacuumInfo(state, meta.battery) : null,
  };
}
