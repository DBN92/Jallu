import { useEffect, useState } from 'react';
import { api, errorMessage } from '../services/api';

interface TvOption {
  entityId: string;
  name: string;
  state: string;
  canMute: boolean;
  canVolume: boolean;
}

/**
 * Ajustes › TV no mudo: enquanto a Luna escuta, a TV escolhida fica no mudo (ou com volume baixo) e volta
 * como estava no fim. A lista vem do Home Assistant (TVs e caixas de som que aceitam mudo ou volume).
 */
export function TvDuckSettings({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<{ entityId: string | null; options: TvOption[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ entityId: string | null; options: TvOption[] }>('/api/tv').then(setData, (e) => setError(errorMessage(e)));
  }, []);
  const save = async (entityId: string | null) => {
    setError(null);
    try {
      const r = await api<{ entityId: string | null }>('/api/tv', { method: 'PUT', body: { entityId } });
      setData((d) => (d ? { ...d, entityId: r.entityId } : d));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  if (!data) return <p className="p-4 text-xs text-white/45">{error ?? 'Carregando…'}</p>;
  return (
    <div className="space-y-2 p-4 text-sm">
      <p className="text-xs text-white/50">
        Quando você chama a Luna, a TV escolhida fica no mudo enquanto ela escuta e responde, e volta como estava no fim. Assim o microfone não mistura a TV com o seu pedido. Se a TV já estava no mudo ou desligada, nada muda.
      </p>
      {data.options.length === 0 ? (
        <p className="text-xs text-amber-200/80">Nenhuma TV no Home Assistant aceita mudo ou volume. Adicione a integração da sua TV no Home Assistant (ex.: Samsung, LG, Android TV, Roku) e volte aqui.</p>
      ) : (
        <select
          className="w-full rounded-sm border border-white/10 bg-ink-900 px-3 py-2.5 text-white"
          value={data.entityId ?? ''}
          disabled={!isAdmin}
          onChange={(e) => void save(e.target.value || null)}
          aria-label="TV que fica no mudo"
        >
          <option value="">Não mexer na TV</option>
          {data.options.map((o) => (
            <option key={o.entityId} value={o.entityId}>
              {o.name} {o.canMute ? '' : '(abaixa o volume)'}
            </option>
          ))}
        </select>
      )}
      {!isAdmin && <p className="text-xs text-white/45">Só o administrador muda este ajuste.</p>}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
