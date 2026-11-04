import { useEffect, useState, type FormEvent } from 'react';
import { Brain, Trash2 } from 'lucide-react';
import type { MemoryDto } from '@luna/shared';
import { Page } from '../components/Layout';
import { Banner, Button, Card, PageHeader, Spinner, inputClass } from '../components/ui';
import { api, errorMessage } from '../services/api';

const TYPE_LABEL: Record<MemoryDto['type'], string> = {
  preference: 'Preferência',
  fact: 'Informação',
  home: 'Casa',
  context: 'Contexto',
  summary: 'Resumo de conversa',
};

export default function MemoryPage() {
  const [items, setItems] = useState<MemoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [type, setType] = useState<MemoryDto['type']>('preference');

  const load = () => api<MemoryDto[]>('/api/memories').then(setItems).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/memories', { body: { type, content } });
      setContent('');
      void load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (id: string) => {
    await api(`/api/memories/${id}`, { method: 'DELETE' }).catch((e) => setError(errorMessage(e)));
    void load();
  };

  const clearAll = async () => {
    if (!confirm('Apagar TODAS as memórias da Luna? Esta ação não pode ser desfeita.')) return;
    await api('/api/memories', { method: 'DELETE' }).catch((e) => setError(errorMessage(e)));
    void load();
  };

  return (
    <Page>
      <PageHeader title="Memória" subtitle="O que a Luna sabe sobre você — somente o que você pediu para lembrar" />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <Card className="mb-4">
        <form onSubmit={add} className="space-y-2">
          <div className="flex gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as MemoryDto['type'])} className={`${inputClass} w-40`}>
              <option value="preference">Preferência</option>
              <option value="fact">Informação</option>
              <option value="home">Casa</option>
            </select>
            <input className={inputClass} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ex.: Prefiro luz quente à noite" maxLength={1000} required minLength={2} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/40">Dica: diga “Luna, lembre que…” ou “esqueça que…”. Senhas e documentos não são memorizados.</p>
            <Button type="submit">Adicionar</Button>
          </div>
        </form>
      </Card>
      {!items ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-8 text-center text-sm text-white/50">
          <Brain className="h-8 w-8 text-violet-300/60" />
          Nenhuma memória salva. A Luna não inventa lembranças.
        </Card>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((m) => (
              <li key={m.id} className="glass flex items-start gap-3 rounded-2xl p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium tracking-wider text-cyan-300 uppercase">{TYPE_LABEL[m.type] ?? m.type}</p>
                  <p className="mt-0.5 text-sm text-white/85">{m.content}</p>
                  <p className="mt-1 text-[11px] text-white/35">
                    {new Date(m.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {m.source === 'manual' ? 'adicionada manualmente' : 'pela conversa'}
                  </p>
                </div>
                <button onClick={() => void remove(m.id)} className="rounded-full p-2 text-white/40 hover:bg-rose-500/15 hover:text-rose-300" aria-label="Apagar memória">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-center">
            <Button variant="danger" onClick={() => void clearAll()}>
              Apagar todas as memórias
            </Button>
          </div>
        </>
      )}
    </Page>
  );
}
