import { useEffect, useMemo, useState } from 'react';
import { HOUSE_AUTOMATIONS, type HouseLinksDto } from '@luna/shared';
import { api } from '../services/api';
import { useDevices } from '../stores/devices';
import { resolveHouseLinks } from '../lib/houseLinks';

/** Estado real (Home Assistant) dos itens da maquete 3D, no formato que a maquete entende. */
export function useHouseState() {
  const devices = useDevices((s) => s.devices);
  const loadDevices = useDevices((s) => s.load);
  const [links, setLinks] = useState<HouseLinksDto | null>(null);
  useEffect(() => {
    if (!Object.keys(useDevices.getState().devices).length) void loadDevices(true);
    api<HouseLinksDto>('/api/house/links').then(setLinks).catch(() => setLinks({}));
  }, [loadDevices]);
  // Vínculo de cada item: o escolhido pelo administrador ou, sem escolha, o aparelho de mesmo nome
  const resolved = useMemo(() => resolveHouseLinks(links ?? {}, Object.values(devices)), [links, devices]);
  const state = useMemo(() => {
    const autos: Record<string, unknown> = {};
    for (const a of HOUSE_AUTOMATIONS) {
      const d = resolved[a.id]?.device;
      if (!d) continue;
      autos[a.id] = { on: d.isOn === true, available: d.available, dim: d.supportsBrightness, color: d.supportsColor, level: d.isOn && d.brightness ? d.brightness : null, rgb: d.rgb };
    }
    return { type: 'casa3d-state', autos };
  }, [resolved]);
  return { devices, links, setLinks, resolved, state };
}
