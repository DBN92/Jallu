import { HOUSE_AUTOMATIONS, type DeviceDto, type HouseAutomationId, type HouseLinksDto } from '@luna/shared';

export const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Qual aparelho real cada item da maquete controla.
 * - vínculo salvo pelo administrador (ou null = “nenhum”);
 * - sem vínculo salvo: o aparelho controlável do tipo certo com exatamente o mesmo nome (se houver só um).
 * Nunca inventa entidade: só usa aparelhos que vieram do Home Assistant.
 */
export function resolveHouseLinks(links: HouseLinksDto, devices: DeviceDto[]): Partial<Record<HouseAutomationId, { device: DeviceDto; auto: boolean }>> {
  const out: Partial<Record<HouseAutomationId, { device: DeviceDto; auto: boolean }>> = {};
  for (const a of HOUSE_AUTOMATIONS) {
    const stored = links[a.id];
    if (stored === null) continue;
    if (stored) {
      const device = devices.find((d) => d.entityId === stored);
      if (device) out[a.id] = { device, auto: false };
      continue;
    }
    const same = devices.filter((d) => d.controllable && (a.domains as readonly string[]).includes(d.domain) && normalizeName(d.name) === normalizeName(a.name));
    if (same.length === 1) out[a.id] = { device: same[0]!, auto: true };
  }
  return out;
}
