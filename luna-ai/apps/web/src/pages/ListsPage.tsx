import { useEffect, useState, type FormEvent } from 'react';
import { Check, CheckCheck, Home, Pin, PinOff, Plus, ShoppingCart, StickyNote, Trash2, Undo2 } from 'lucide-react';
import type { NoteDto, PantryItemDto } from '@luna/shared/types';
import { Page } from '../components/Layout';
import { Banner, Button, Card, PageHeader, Spinner, inputClass } from '../components/ui';
import { listApi, useLists } from '../stores/lists';

type Tab = 'buy' | 'have' | 'notes';
const TABS: { id: Tab; label: string; icon: typeof ShoppingCart }[] = [
  { id: 'buy', label: 'Comprar', icon: ShoppingCart },
  { id: 'have', label: 'Em casa', icon: Home },
  { id: 'notes', label: 'Notas', icon: StickyNote },
];

function AddForm({ placeholder, onAdd, multiline }: { placeholder: string; onAdd: (v: string) => Promise<string | null>; multiline?: boolean }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!v.trim() || busy) return;
    setBusy(true);
    const err = await onAdd(v.trim());
    setBusy(false);
    if (!err) setV('');
  };
  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      {multiline ? (
        <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} rows={2} maxLength={4000} className={`${inputClass} resize-y`} />
      ) : (
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} maxLength={200} className={inputClass} enterKeyHint="done" />
      )}
      <Button type="submit" disabled={!v.trim() || busy} label="Adicionar">
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}

function ItemRow({ item, onError }: { item: PantryItemDto; onError: (e: string | null) => void }) {
  const run = useLists((s) => s.run);
  const [qty, setQty] = useState(item.quantity ?? '');
  useEffect(() => setQty(item.quantity ?? ''), [item.quantity]);
  const buy = item.status === 'buy';
  return (
    <li className="flex items-center gap-3 border-t border-white/10 py-2.5 first:border-t-0">
      <button
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${buy ? 'border-cyan-300/50' : 'border-amber-300/50 text-amber-200'}`}
        aria-label={buy ? `Comprei ${item.name}` : `Acabou ${item.name}`}
        title={buy ? 'Comprei' : 'Acabou'}
        onClick={async () => onError(await run(() => listApi.patch(item.id, { status: buy ? 'have' : 'buy' })))}
      >
        {buy ? <Check className="h-4 w-4 text-cyan-300/70" /> : <Undo2 className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">{item.name}</p>
      </div>
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onBlur={async () => qty !== (item.quantity ?? '') && onError(await run(() => listApi.patch(item.id, { quantity: qty || null })))}
        placeholder="qtd."
        maxLength={30}
        aria-label={`Quantidade de ${item.name}`}
        className="w-20 rounded-sm border border-white/10 bg-transparent px-2 py-1 text-right text-sm text-white/80 outline-none focus:border-cyan-300/50"
      />
      <button className="p-1.5 text-white/40 hover:text-rose-200" aria-label={`Apagar ${item.name}`} onClick={async () => onError(await run(() => listApi.remove(item.id)))}>
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function NoteCard({ note, onError }: { note: NoteDto; onError: (e: string | null) => void }) {
  const run = useLists((s) => s.run);
  const [text, setText] = useState(note.text);
  useEffect(() => setText(note.text), [note.text]);
  return (
    <Card className={note.pinned ? 'border-amber-300/40' : ''}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={async () => text.trim() && text !== note.text && onError(await run(() => listApi.patchNote(note.id, { text })))}
        rows={Math.min(8, Math.max(2, text.split('\n').length))}
        maxLength={4000}
        aria-label="Nota"
        className="w-full resize-y bg-transparent text-[15px] text-cyan-50 outline-none"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-white/40">
        <span>{new Date(note.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex gap-1">
          <button className="p-1.5 hover:text-amber-200" aria-label={note.pinned ? 'Desafixar' : 'Fixar no topo'} onClick={async () => onError(await run(() => listApi.patchNote(note.id, { pinned: !note.pinned })))}>
            {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <button
            className="p-1.5 hover:text-rose-200"
            aria-label="Apagar nota"
            onClick={async () => {
              if (window.confirm('Apagar esta nota?')) onError(await run(() => listApi.removeNote(note.id)));
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

/** Listas da casa: o que falta comprar, o que tem em casa e notas. */
export default function ListsPage() {
  const { items, notes, error: loadError, load, run } = useLists();
  const [tab, setTab] = useState<Tab>('buy');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => void load(), [load]);

  const buy = (items ?? []).filter((i) => i.status === 'buy');
  const have = (items ?? []).filter((i) => i.status === 'have' && i.name.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')));
  const count = { buy: buy.length, have: (items ?? []).filter((i) => i.status === 'have').length, notes: notes?.length ?? 0 };
  // Vários itens de uma vez: “leite, pão, ovos”
  const addItems = (status: 'have' | 'buy') => async (v: string) => {
    const err = await run(async () => {
      for (const n of v.split(/\s*[,;\n]\s*/).filter(Boolean)) await listApi.add(n, status);
    });
    setError(err);
    return err;
  };

  return (
    <Page>
      <PageHeader title="Listas" subtitle="O que falta comprar, o que tem em casa e anotações. Também por voz: “Oi, Luna, acabou o café”." />
      {(error || loadError) && <Banner onClose={() => setError(null)}>{error ?? loadError}</Banner>}
      <div role="tablist" className="mb-4 grid grid-cols-3 gap-1 rounded-sm bg-white/5 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex items-center justify-center gap-1.5 rounded-sm py-2.5 text-sm ${tab === id ? 'border border-cyan-300/60 bg-cyan-400/20 text-cyan-50' : 'text-white/70'}`}>
            <Icon className="h-4 w-4" /> {label}
            {count[id] > 0 && <span className="rounded-full bg-white/10 px-1.5 text-[11px]">{count[id]}</span>}
          </button>
        ))}
      </div>

      {!items || !notes ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : tab === 'notes' ? (
        <div className="space-y-3">
          <AddForm placeholder="Escreva uma nota…" multiline onAdd={async (v) => { const err = await run(() => listApi.addNote(v)); setError(err); return err; }} />
          {notes.length === 0 && <p className="py-6 text-center text-sm text-white/45">Nenhuma nota. Diga “Oi, Luna, cria uma nota: …”.</p>}
          {notes.map((n) => <NoteCard key={n.id} note={n} onError={setError} />)}
        </div>
      ) : (
        <Card>
          <AddForm placeholder={tab === 'buy' ? 'O que falta? (ex.: leite, pão, ovos)' : 'O que tem em casa? (ex.: arroz, feijão)'} onAdd={addItems(tab)} />
          {tab === 'have' && count.have > 8 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Procurar…" className={`${inputClass} mt-2`} />}
          <ul className="mt-3">
            {(tab === 'buy' ? buy : have).map((i) => <ItemRow key={i.id} item={i} onError={setError} />)}
          </ul>
          {tab === 'buy' && buy.length === 0 && <p className="py-6 text-center text-sm text-white/45">Nada para comprar. Quando algo acabar, toque em ↺ na aba “Em casa” ou diga “acabou o …”.</p>}
          {tab === 'have' && have.length === 0 && <p className="py-6 text-center text-sm text-white/45">{filter ? 'Nada encontrado.' : 'Ainda não há itens em casa. Ao marcar ✓ na lista de compras, o item vem para cá.'}</p>}
          {tab === 'buy' && buy.length > 1 && (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" onClick={async () => window.confirm('Marcar todos os itens como comprados?') && setError(await run(() => listApi.boughtAll()))}>
                <CheckCheck className="h-4 w-4" /> Comprei tudo
              </Button>
            </div>
          )}
          <p className="mt-3 text-xs text-white/40">{tab === 'buy' ? '✓ = comprei (o item passa para “Em casa”).' : '↺ = acabou (o item volta para a lista de compras).'}</p>
        </Card>
      )}
    </Page>
  );
}
