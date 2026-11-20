import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RecordingsDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { Toggle } from './ui';

const gb = (b: number | null) => (b === null ? '—' : `${(b / 1024 ** 3).toFixed(b >= 100 * 1024 ** 3 ? 0 : 1)} GB`);
const STATUS: Record<string, string> = { gravando: '● gravando', iniciando: 'iniciando…', erro: 'tentando de novo', 'sem-video': 'sem vídeo', desligada: '' };

/**
 * Ajustes › Gravação das câmeras: liga/desliga por câmera. O vídeo fica no servidor em
 * Câmera/ano/mês/dia (arquivos de 10 min) e é apagado depois de 7 dias.
 */
export function RecordingsSettings({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<RecordingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api<RecordingsDto>('/api/recordings').then(setData, (e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, []);
  const set = async (entityId: string, enabled: boolean) => {
    setBusy(entityId);
    setError(null);
    try {
      setData(await api<RecordingsDto>(`/api/recordings/${entityId}`, { method: 'PUT', body: { enabled } }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  if (!data) return <p className="p-4 text-xs text-white/45">{error ?? 'Carregando…'}</p>;
  const usedPct = data.totalBytes && data.freeBytes !== null ? Math.round(100 * (1 - data.freeBytes / data.totalBytes)) : null;
  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="text-xs text-white/50">
        Vídeo contínuo no servidor, em <b className="text-white/75">{data.dir}</b>/Câmera/ano/mês/dia (um arquivo a cada 10 minutos). Guarda {data.keepDays} dias e apaga os mais antigos antes, se o disco ficar com menos de 10% livre.
      </p>
      {usedPct !== null && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <i className={`block h-full ${usedPct > 90 ? 'bg-rose-400' : 'bg-sky-300'}`} style={{ width: `${usedPct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-white/45">
            Disco: {gb(data.freeBytes)} livres de {gb(data.totalBytes)} · cada câmera usa ~0,5 a 1,5 GB por hora
          </p>
        </div>
      )}
      {!data.ffmpeg && <p className="text-xs text-amber-200/80">O conversor de vídeo (ffmpeg) não está instalado no servidor. Rode: sudo bash scripts/ffmpeg-setup.sh</p>}
      <div className="divide-y divide-white/5">
        {data.cameras.map((c) => (
          <div key={c.entityId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.name}</p>
              <p className={`${c.status === 'erro' ? 'break-words' : 'truncate'} text-[11.5px] ${c.status === 'gravando' ? 'text-rose-300' : c.status === 'erro' ? 'text-amber-200/80' : 'text-white/45'}`}>
                {!c.supported ? 'Sem vídeo contínuo (só imagens ou site): não dá para gravar' : c.enabled ? `${STATUS[c.status]}${c.error && c.status !== 'gravando' ? ` · ${c.error}` : ''}` : `Pasta: ${c.folder}`}
              </p>
            </div>
            <Toggle label={`Gravar ${c.name}`} checked={c.enabled} disabled={!isAdmin || !c.supported || busy === c.entityId || (!data.ffmpeg && !c.enabled)} onChange={(v) => void set(c.entityId, v)} />
          </div>
        ))}
        {!data.cameras.length && <p className="py-2 text-xs text-white/45">Nenhuma câmera.</p>}
      </div>
      <Link to="/gravacoes" className="inline-block text-xs text-sky-300 underline">
        Assistir gravações
      </Link>
      {!isAdmin && <p className="text-xs text-white/45">Só o administrador liga ou desliga a gravação.</p>}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
