import { useEffect, useState } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../services/api';
import { Banner, Button, inputClass } from './ui';

interface TokenInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca usado');

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Sem permissão de área de transferência (ex.: http): seleciona o texto para copiar à mão
      const el = document.getElementById(`cf-${label}`) as HTMLInputElement | null;
      el?.select();
      return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <label className="block">
      <span className="text-xs text-white/50">{label}</span>
      <span className="mt-1 flex gap-2">
        <input id={`cf-${label}`} readOnly value={value} className={`${inputClass} py-2 font-mono text-xs ${secret ? 'text-amber-100' : ''}`} onFocus={(e) => e.target.select()} />
        <Button type="button" variant="ghost" className="shrink-0 px-3" onClick={() => void copy()} aria-label={`Copiar ${label}`}>
          {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </span>
    </label>
  );
}

/** Configurações › Siri e Atalhos: token próprio para o app Atalhos do iPhone e o passo a passo. */
export function SiriSettings() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [name, setName] = useState('iPhone');
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const url = `${window.location.origin}/api/siri/ask`;
  const local = window.location.protocol !== 'https:' || /^(\d+\.){3}\d+$|\.local$|localhost/.test(window.location.hostname);

  const load = () => api<TokenInfo[]>('/api/siri/tokens').then(setTokens).catch((e) => setError(errorMessage(e)));
  useEffect(() => void load(), []);

  const create = async () => {
    setError(null);
    try {
      const r = await api<{ token: string; info: TokenInfo }>('/api/siri/tokens', { body: { name } });
      setFresh(r.token);
      setTest(null);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Apagar este token? O atalho que usa ele para de funcionar.')) return;
    await api(`/api/siri/tokens/${id}`, { method: 'DELETE' }).catch((e) => setError(errorMessage(e)));
    void load();
  };
  const runTest = async () => {
    if (!fresh) return;
    setTest('Testando…');
    try {
      const r = await fetch('/api/siri/ask', { method: 'POST', headers: { authorization: `Bearer ${fresh}`, 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'que horas são?' }) });
      setTest(`${r.ok ? '✅' : '⚠️'} A Luna respondeu: “${await r.text()}”`);
    } catch {
      setTest('⚠️ Não consegui falar com a Luna.');
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-white/60">
        Fale com a Luna pela Siri, até com o iPhone bloqueado: diga <b>“E aí Siri, Luna”</b>, depois o comando (ex.: “acende a luz da sala”), e a Siri fala a resposta. Funciona pelo app <b>Atalhos</b> do iPhone com um token
        próprio, que só serve para mandar comandos à Luna — não é a sua senha e pode ser apagado quando quiser.
      </p>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}

      {tokens.length > 0 && (
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{t.name}</span>
                <span className="block text-xs text-white/40">
                  {t.prefix}… · {t.lastUsedAt ? `usado ${when(t.lastUsedAt)}` : 'nunca usado'}
                </span>
              </span>
              <button className="shrink-0 rounded-full p-2 text-white/60 hover:text-rose-300" onClick={() => void remove(t.id)} aria-label={`Apagar token ${t.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!fresh && (
        <div className="flex gap-2">
          <input className={`${inputClass} py-2`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: iPhone do Daniel)" maxLength={40} />
          <Button type="button" className="shrink-0" onClick={() => void create()}>
            Criar token
          </Button>
        </div>
      )}

      {fresh && (
        <div className="space-y-3 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-3">
          <p className="text-amber-100">Copie o token agora — por segurança ele não aparece de novo.</p>
          <CopyField label="Endereço (URL)" value={url} />
          <CopyField label="Token (cabeçalho Authorization)" value={`Bearer ${fresh}`} secret />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => void runTest()}>
              Testar o token
            </Button>
            {test && <span className="text-white/70">{test}</span>}
          </div>
          {local && (
            <p className="text-xs text-amber-100/80">
              Você abriu a Luna por um endereço da rede de casa. Para a Siri funcionar também fora de casa, abra a Luna pelo endereço do Cloudflare (https) e crie o token por lá — o endereço acima muda junto.
            </p>
          )}
          <ol className="list-decimal space-y-2 pl-5 text-white/75">
            <li>
              No iPhone, abra o app <b>Atalhos</b>, toque em <b>+</b> e dê o nome <b>Luna</b> ao atalho (é o nome que você vai falar para a Siri).
            </li>
            <li>
              Adicione a ação <b>Ditar Texto</b>. Em idioma, escolha <b>Português (Brasil)</b>; em “Parar de Ouvir”, <b>Após Pausa</b>.
            </li>
            <li>
              Adicione a ação <b>Obter Conteúdo do URL</b>:
              <ul className="mt-1 list-disc space-y-1 pl-5 text-white/65">
                <li>em URL, cole o <b>Endereço</b> copiado acima;</li>
                <li>
                  toque na setinha: <b>Método</b> = <b>POST</b>;
                </li>
                <li>
                  <b>Cabeçalhos</b> → Adicionar: chave <code>Authorization</code>, valor = o <b>Token</b> copiado (começa com “Bearer luna_”);
                </li>
                <li>
                  <b>Corpo da Solicitação</b> = <b>JSON</b> → Adicionar campo <b>Texto</b>: chave <code>texto</code>, valor = a variável <b>Texto Ditado</b>.
                </li>
              </ul>
            </li>
            <li>
              Adicione a ação <b>Falar Texto</b> com <b>Conteúdo do URL</b>.
            </li>
            <li>
              Pronto: diga <b>“E aí Siri, Luna”</b> e, quando ela abrir o ditado, fale o comando.
            </li>
          </ol>
          <p className="text-xs text-white/50">
            Atalhos de um comando só (ex.: “E aí Siri, boa noite Luna”): duplique o atalho, troque “Ditar Texto” por uma ação <b>Texto</b> com a frase (“boa noite”) e use “Texto” no campo <code>texto</code>.
            Se a Luna estiver protegida pelo Cloudflare Access, libere o caminho <code>/api/siri/ask</code> (veja docs/SIRI.md).
          </p>
          <Button type="button" variant="ghost" onClick={() => setFresh(null)}>
            Já copiei, fechar
          </Button>
        </div>
      )}
    </div>
  );
}
