import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import type { WebCameraDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useCameras } from '../stores/cameras';
import { Button, inputClass } from './ui';

const SMART_LIFE = 'https://protect-us.ismartlife.me';

/**
 * Ajustes › Câmeras no site do fabricante: atalhos (ex.: babá eletrônica Smart Life) que aparecem com as
 * outras câmeras e abrem o site no navegador. O login é feito lá (QR code do app) e fica salvo no aparelho.
 */
export function WebCameras() {
  const [list, setList] = useState<WebCameraDto[] | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState(SMART_LIFE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<WebCameraDto[]>('/api/cameras/web').then(setList, (e) => setError(errorMessage(e)));
  useEffect(() => void load(), []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/cameras/web', { body: { name, url } });
      setName('');
      setUrl(SMART_LIFE);
      await load();
      void useCameras.getState().load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: WebCameraDto) => {
    if (!confirm(`Remover o atalho “${c.name}”?`)) return;
    try {
      await api(`/api/cameras/web/${c.id}`, { method: 'DELETE' });
      await load();
      void useCameras.getState().load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="text-xs text-white/50">
        Para câmeras que o Home Assistant não mostra (ex.: babá eletrônica Smart Life). O atalho aparece em Câmeras e atende “abre a câmera da …”, abrindo o site do fabricante no navegador. Entre no site uma vez pelo QR code do app; o login fica salvo no aparelho. A Luna não recebe a imagem nem senha.
      </p>
      {list?.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 rounded-sm bg-white/5 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{c.name}</p>
            <p className="truncate text-xs text-white/45">{c.url}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="rounded-sm p-2 text-cyan-200/80" aria-label={`Abrir ${c.name}`}>
              <ExternalLink className="h-4 w-4" />
            </a>
            <button onClick={() => void remove(c)} className="rounded-sm p-2 text-rose-300/80" aria-label={`Remover ${c.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <input className={inputClass} placeholder="Nome (ex.: Câmera Luiza)" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        <input className={inputClass} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={500} inputMode="url" />
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Adicionar'}
        </Button>
      </form>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
