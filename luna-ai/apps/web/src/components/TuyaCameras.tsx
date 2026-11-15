import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { useCameras } from '../stores/cameras';
import { Button } from './ui';

interface TuyaDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
}

/** Categorias de câmera na Tuya (câmera comum, babá eletrônica, campainha com vídeo…) */
const CAMERA_CATS = new Set(['sp', 'cdsxj', 'dghsxj', 'sxj', 'wf_sp', 'videodoorbell', 'msp_sp']);

/**
 * Ajustes › Câmeras Smart Life (nuvem Tuya): lista os aparelhos da conta ligada ao projeto e adiciona a
 * câmera como câmera da Luna (vídeo ao vivo, foto, descanso de tela). A chave fica só no .env do servidor.
 */
export function TuyaCameras() {
  const [data, setData] = useState<{ configured: boolean; devices: TuyaDevice[]; error: string | null } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [t, direct] = await Promise.all([
        api<{ configured: boolean; devices: TuyaDevice[]; error: string | null }>('/api/cameras/tuya'),
        api<{ cameras: { url: string }[] }>('/api/cameras/direct').catch(() => ({ cameras: [] })),
      ]);
      setData(t);
      setAdded(new Set(direct.cameras.map((c) => c.url.replace(/^tuya:\/\//, '')).filter(Boolean)));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => void load(), []);

  const add = async (d: TuyaDevice) => {
    setBusy(d.id);
    setError(null);
    try {
      await api('/api/cameras/direct', { body: { name: d.name, url: `tuya://${d.id}`, transport: 'tcp' } });
      await load();
      void useCameras.getState().load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <p className="p-4 text-xs text-white/45">{error ?? 'Carregando…'}</p>;
  if (!data.configured)
    return (
      <div className="space-y-2 p-4 text-xs text-white/55">
        <p>Mostra dentro da Luna, com vídeo ao vivo, câmeras Smart Life que o Home Assistant não suporta (ex.: babá eletrônica).</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            Crie uma conta e um projeto “Cloud” em <b>iot.tuya.com</b>, com data center <b>Western America</b>.
          </li>
          <li>
            No projeto: <b>Devices › Link App Account</b> e escaneie o QR code com o app Smart Life (Eu › ícone de leitura).
          </li>
          <li>
            Em <b>Service API</b>, confirme que <b>IoT Core</b> e <b>IoT Video Live Stream</b> estão autorizados.
          </li>
          <li>
            Copie o <b>Access ID</b> e o <b>Access Secret</b> do projeto para o arquivo <b>.env</b> do servidor (TUYA_ACCESS_ID e TUYA_ACCESS_SECRET) e atualize a Luna.
          </li>
        </ol>
        <p>A chave fica só no servidor; o navegador nunca a recebe.</p>
      </div>
    );

  const cams = data.devices.filter((d) => CAMERA_CATS.has(d.category));
  const shown = cams.length ? cams : data.devices;
  return (
    <div className="space-y-2 p-4 text-sm">
      {data.error && <p className="text-xs text-rose-300">{data.error}</p>}
      {!data.error && !shown.length && <p className="text-xs text-white/50">Nenhum aparelho na conta ligada ao projeto. Confira o “Link App Account” na Tuya IoT Platform.</p>}
      {shown.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 rounded-sm bg-white/5 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{d.name}</p>
            <p className="text-xs text-white/45">
              {d.online ? 'online' : 'offline'} · {d.category || 'aparelho'}
            </p>
          </div>
          {added.has(d.id) ? (
            <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Na Luna
            </span>
          ) : (
            <Button onClick={() => void add(d)} disabled={busy === d.id}>
              <Plus className="h-4 w-4" /> {busy === d.id ? 'Adicionando…' : 'Adicionar'}
            </Button>
          )}
        </div>
      ))}
      <button onClick={() => void load()} className="flex items-center gap-1.5 text-xs text-cyan-200/70">
        <RefreshCw className="h-3.5 w-3.5" /> Atualizar lista
      </button>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <p className="text-xs text-white/40">A câmera adicionada aparece em Câmeras e nas câmeras diretas acima (lá dá para testar e renomear). Se você tinha um atalho para o site, pode removê-lo.</p>
    </div>
  );
}
