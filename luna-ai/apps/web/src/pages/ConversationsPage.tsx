import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import type { ConversationSummaryDto } from '@luna/shared';
import { Page } from '../components/Layout';
import { MessageList } from '../components/Messages';
import { Banner, Button, Card, PageHeader, Spinner, inputClass } from '../components/ui';
import { api, errorMessage } from '../services/api';
import { useAssistant, type UiMessage } from '../stores/assistant';

interface Detail {
  id: string;
  title: string;
  summary: string | null;
  messages: UiMessage[];
}

export default function ConversationsPage() {
  const [list, setList] = useState<ConversationSummaryDto[] | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const openConversation = useAssistant((s) => s.openConversation);
  const navigate = useNavigate();

  const load = () => api<ConversationSummaryDto[]>('/api/conversations').then(setList).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);

  const view = async (id: string) => {
    try {
      setOpen(await api<Detail>(`/api/conversations/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Apagar esta conversa?')) return;
    await api(`/api/conversations/${id}`, { method: 'DELETE' }).catch((e) => setError(errorMessage(e)));
    setOpen(null);
    void load();
  };

  const summarize = async (id: string) => {
    setBusy(true);
    try {
      const r = await api<{ summary: string }>(`/api/conversations/${id}/summarize`, { method: 'POST' });
      setOpen((o) => (o ? { ...o, summary: r.summary } : o));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string, title: string) => {
    await api(`/api/conversations/${id}`, { method: 'PATCH', body: { title } }).catch((e) => setError(errorMessage(e)));
    setEditing(null);
    setOpen((o) => (o ? { ...o, title } : o));
    void load();
  };

  if (open) {
    return (
      <Page>
        <button onClick={() => setOpen(null)} className="mb-3 flex items-center gap-1 text-sm text-white/60">
          <ArrowLeft className="h-4 w-4" /> Conversas
        </button>
        {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
        {editing === open.id ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void rename(open.id, String(new FormData(e.currentTarget).get('title')));
            }}
            className="mb-4 flex gap-2"
          >
            <input name="title" defaultValue={open.title} className={inputClass} maxLength={80} autoFocus />
            <Button type="submit">Salvar</Button>
          </form>
        ) : (
          <PageHeader
            title={open.title}
            action={
              <button onClick={() => setEditing(open.id)} className="glass rounded-full p-2" aria-label="Renomear">
                <Pencil className="h-4 w-4" />
              </button>
            }
          />
        )}
        {open.summary && (
          <Card className="mb-4 text-sm text-white/70">
            <p className="mb-1 text-xs font-medium tracking-wide text-cyan-300 uppercase">Resumo</p>
            {open.summary}
          </Card>
        )}
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              await openConversation(open.id);
              navigate('/');
            }}
          >
            <MessageSquare className="h-4 w-4" /> Continuar
          </Button>
          <Button variant="ghost" busy={busy} onClick={() => void summarize(open.id)}>
            <FileText className="h-4 w-4" /> Resumir e memorizar
          </Button>
          <Button variant="danger" onClick={() => void remove(open.id)}>
            <Trash2 className="h-4 w-4" /> Apagar
          </Button>
        </div>
        <MessageList messages={open.messages} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Conversas" subtitle="Histórico salvo no seu servidor" />
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      {!list ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <Card className="text-center text-sm text-white/50">Nenhuma conversa ainda. Fale com a Luna na tela inicial.</Card>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => void view(c.id)} className="glass flex w-full items-center gap-3 rounded-sm p-4 text-left transition hover:bg-white/8">
                <MessageSquare className="h-5 w-5 shrink-0 text-violet-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-xs text-white/40">
                    {new Date(c.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {c.messageCount} mensagens
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
