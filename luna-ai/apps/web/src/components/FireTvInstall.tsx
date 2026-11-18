import { useState } from 'react';
import { Tv } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { Button } from './ui';

/**
 * Instalar o app na Fire TV / Android TV: o app Downloader de lá não tem o login da Luna, então a Luna
 * gera um endereço curto (vale 2 h, mesmo se a Luna reiniciar) para digitar com o controle.
 */
export function FireTvInstall() {
  const [link, setLink] = useState<{ url: string; until: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const make = async () => {
    setError(null);
    try {
      const r = await api<{ path: string; expiresAt: string }>('/api/android/download-link', { method: 'POST' });
      setLink({ url: `${window.location.origin}${r.path}`, until: new Date(r.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="flex items-center gap-2 font-medium text-white">
        <Tv className="h-4 w-4" /> Instalar na Fire TV / Android TV
      </p>
      {!link ? (
        <Button type="button" variant="ghost" onClick={() => void make()}>
          Gerar link de instalação
        </Button>
      ) : (
        <div className="rounded-sm bg-white/5 p-3">
          <p className="text-xs text-white/50">Digite na TV (vale até {link.until}):</p>
          <p className="mt-1 font-mono text-xl tracking-wide break-all text-cyan-100 select-all">{link.url}</p>
        </div>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-white/60">
        <li>
          Na Fire TV, instale o app <b>Downloader</b> (grátis, na loja da Amazon).
        </li>
        <li>
          Permita a instalação: <b>Configurações › Minha Fire TV › Opções do desenvolvedor › Instalar apps desconhecidos › Downloader: ligado</b>. Se “Opções do desenvolvedor” não aparecer: em <b>Minha Fire TV › Sobre</b>, clique 7 vezes no nome do aparelho.
        </li>
        <li>Abra o Downloader, digite o endereço acima e instale.</li>
        <li>Abra a Luna na TV (ela aparece junto dos apps), informe o endereço da Luna e entre com seu usuário.</li>
      </ol>
      <p className="text-xs text-white/40">Na TV a Luna abre no modo TV (controle pelo direcional). O chamado “Oi, Luna” e a câmera de presença são para o tablet: a Fire TV não tem microfone nem câmera para isso.</p>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
