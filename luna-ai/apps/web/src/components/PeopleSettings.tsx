import { useEffect, useState } from 'react';
import { useDevices } from '../stores/devices';
import { usePeople } from '../stores/people';
import { Toggle, inputClass } from './ui';

/** Ajustes › Quem está em casa: o que a Luna faz quando alguém chega e quando sai o último. */
export function PeopleSettings({ isAdmin }: { isAdmin: boolean }) {
  const { list, config, load, saveConfig } = usePeople();
  const lights = Object.values(useDevices((s) => s.devices)).filter((d) => d.domain === 'light' && !d.hidden).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void load(), [load]);
  const save = async (patch: Parameters<typeof saveConfig>[0]) => setError(await saveConfig(patch));

  if (list && !list.length)
    return (
      <div className="px-4 py-3 text-xs leading-relaxed text-white/55">
        Nenhuma pessoa cadastrada no Home Assistant. Para a Luna saber quem está em casa: instale o app <b>Home Assistant</b> no celular de cada morador (com a localização ligada) e, no Home Assistant, vá em <b>Configurações › Pessoas</b>, crie cada pessoa e ligue o celular dela em “Rastrear dispositivo”.
      </div>
    );
  if (!config) return null;
  return (
    <div className="space-y-3 px-4 py-3">
      <label className="block text-sm">
        Ao chegar alguém à noite, acender
        <select className={`${inputClass} mt-1`} disabled={!isAdmin} value={config.arriveLight ?? ''} onChange={(e) => void save({ arriveLight: e.target.value || null })}>
          <option value="">Nada</option>
          {lights.map((d) => (
            <option key={d.entityId} value={d.entityId}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm">Quando sair o último, apagar as luzes</p>
        </div>
        <Toggle label="Apagar as luzes quando sair o último" disabled={!isAdmin} checked={config.leaveLightsOff} onChange={(v) => void save({ leaveLightsOff: v })} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm">Avisar no celular quando todos saírem</p>
          <p className="mt-0.5 text-xs text-white/45">Diz o que ficou ligado (por exemplo, a lava e seca). Chega nos celulares com os avisos ligados.</p>
        </div>
        <Toggle label="Avisar quando todos saírem" disabled={!isAdmin} checked={config.leaveNotify} onChange={(v) => void save({ leaveNotify: v })} />
      </div>
      {!isAdmin && <p className="text-xs text-white/45">Só o administrador muda estes ajustes.</p>}
      {error && <p className="text-xs text-rose-200">{error}</p>}
      <p className="text-xs text-white/45">Pela voz: “quem está em casa?”, “o Daniel já chegou?”, “onde está a Ana?”.</p>
    </div>
  );
}
