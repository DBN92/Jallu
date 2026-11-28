import { useEffect, useMemo, useState } from 'react';
import type { DeviceDto, TvPanelDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useDevices } from '../stores/devices';

const MAX = 6;
const isToggle = (d: DeviceDto) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors' && d.domain !== 'vacuum';

/**
 * Ajustes › Painel da TV: quais luzes aparecem no Início do Fire TV. Por padrão a Luna escolhe as que
 * mais são usadas (histórico dos últimos 30 dias); aqui dá para escolher à mão ou voltar ao automático.
 */
export function TvPanelSettings({ isAdmin }: { isAdmin: boolean }) {
  const [panel, setPanel] = useState<TvPanelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const devicesMap = useDevices((s) => s.devices);
  const options = useMemo(
    () => Object.values(devicesMap).filter(isToggle).sort((a, b) => Number(b.category === 'lighting') - Number(a.category === 'lighting') || a.name.localeCompare(b.name, 'pt-BR')),
    [devicesMap],
  );
  useEffect(() => {
    api<TvPanelDto>('/api/tv/panel').then(setPanel, (e) => setError(errorMessage(e)));
  }, []);
  const save = async (favorites: string[] | null) => {
    setError(null);
    try {
      setPanel(await api<TvPanelDto>('/api/tv/panel', { method: 'PUT', body: { favorites } }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  if (!panel) return <p className="p-4 text-xs text-white/45">{error ?? 'Carregando…'}</p>;
  const chosen = panel.favorites;
  const flip = (id: string) => void save(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id].slice(0, MAX));
  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="text-xs text-white/50">
        Luzes que aparecem no Início da TV (até {MAX}). {panel.favoritesAuto ? 'Agora a Luna escolhe as que vocês mais usam.' : 'Escolhidas à mão.'} Cenas rápidas: {panel.scenes.map((s) => s.name).join(', ')}.
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((d) => {
          const on = chosen.includes(d.entityId);
          return (
            <button
              key={d.entityId}
              type="button"
              disabled={!isAdmin || (!on && chosen.length >= MAX)}
              onClick={() => flip(d.entityId)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-xs ${on ? 'border-sky-300/60 bg-sky-300/15 text-sky-100' : 'border-white/10 text-white/60'} disabled:opacity-40`}
            >
              {on ? `${chosen.indexOf(d.entityId) + 1}. ` : ''}
              {d.name}
            </button>
          );
        })}
      </div>
      {isAdmin && !panel.favoritesAuto && (
        <button type="button" className="text-xs text-sky-300 underline" onClick={() => void save(null)}>
          Voltar a escolher pelas mais usadas
        </button>
      )}
      {!isAdmin && <p className="text-xs text-white/45">Só o administrador muda este ajuste.</p>}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
