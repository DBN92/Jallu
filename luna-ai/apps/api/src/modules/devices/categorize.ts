import type { DeviceCategory, DeviceDto } from '@luna/shared';
import type { HaState } from '../../integrations/home-assistant/types';

/** Domínios exibidos no painel. */
export const SUPPORTED_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'climate', 'sensor', 'binary_sensor'] as const;
/** Domínios que podem ser ligados/desligados (lista fechada — a IA não pode chamar outros serviços). */
export const CONTROLLABLE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean', 'climate']);

export const domainOf = (entityId: string) => entityId.split('.')[0] ?? '';

export function categorize(state: HaState): DeviceCategory {
  const domain = domainOf(state.entity_id);
  const dc = state.attributes.device_class;
  if (domain === 'light') return 'lighting';
  if (domain === 'switch') return dc === 'outlet' ? 'outlets' : 'switches';
  if (domain === 'input_boolean') return 'switches';
  if (domain === 'sensor' || domain === 'binary_sensor') return 'sensors';
  if (domain === 'climate' || domain === 'fan') return 'climate';
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
  meta: { aiAllowed: boolean; aliases: string[]; hidden: boolean },
): DeviceDto {
  const domain = domainOf(state.entity_id);
  const available = !['unavailable', 'unknown'].includes(state.state);
  const controllable = CONTROLLABLE_DOMAINS.has(domain);
  const isOn = controllable ? (domain === 'climate' ? state.state !== 'off' : state.state === 'on') : null;
  const raw = state.attributes.brightness;
  return {
    entityId: state.entity_id,
    domain,
    name: (state.attributes.friendly_name as string | undefined) ?? state.entity_id,
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
  };
}
