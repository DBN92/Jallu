import type { NoteDto, PantryItemDto } from '@luna/shared';
import type { Db } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import { normalize } from '../../lib/text';

type ItemRow = { id: string; name: string; status: string; quantity: string | null; updatedAt: Date };
type NoteRow = { id: string; text: string; pinned: boolean; createdAt: Date; updatedAt: Date };

const toItem = (r: ItemRow): PantryItemDto => ({ id: r.id, name: r.name, status: r.status === 'have' ? 'have' : 'buy', quantity: r.quantity, updatedAt: r.updatedAt.toISOString() });
const toNote = (r: NoteRow): NoteDto => ({ id: r.id, text: r.text, pinned: r.pinned, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });

/** “o leite”, “mais 2 pacotes de café” → “Leite” / “2 pacotes de café” */
export function cleanItemName(raw: string): string {
  const t = raw
    .replace(/[.!?;]+$/g, '')
    .replace(/^\s*(?:o|a|os|as|um|uma|uns|umas|mais|de|do|da)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1) : '';
}

/** “leite, pão e ovos” → [“Leite”, “Pão”, “Ovos”] */
export function splitItems(raw: string): string[] {
  return [...new Set(raw.split(/\s*,\s*|\s+e\s+/i).map(cleanItemName).filter((n) => n.length >= 2 && n.length <= 60))];
}

const listJoin = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} e ${a.at(-1)}` : (a[0] ?? ''));

/**
 * Lista da casa e notas: o que tem em casa, o que falta comprar e anotações. Guardado no banco da
 * Luna; todas as telas veem a mesma lista (avisadas em tempo real).
 */
export class ListsService {
  constructor(
    private readonly db: Db,
    private readonly onChange: () => void = () => {},
  ) {}

  async items(): Promise<PantryItemDto[]> {
    return (await this.db.pantryItem.findMany({ orderBy: { name: 'asc' } })).map(toItem);
  }

  /** Cria o item ou, se já existe com esse nome, só muda a situação dele */
  async upsertItem(name: string, status: 'have' | 'buy', quantity?: string | null): Promise<PantryItemDto> {
    const clean = cleanItemName(name);
    if (clean.length < 2 || clean.length > 60) throw badRequest('Nome do item inválido.');
    const key = normalize(clean);
    const q = quantity === undefined ? undefined : quantity?.trim().slice(0, 30) || null;
    const row = await this.db.pantryItem.upsert({
      where: { key },
      create: { name: clean, key, status, quantity: q ?? null },
      update: { status, ...(q !== undefined ? { quantity: q } : {}) },
    });
    this.onChange();
    return toItem(row);
  }

  async updateItem(id: string, patch: { name?: string; status?: 'have' | 'buy'; quantity?: string | null }) {
    const cur = await this.db.pantryItem.findUnique({ where: { id } });
    if (!cur) throw notFound('Item não encontrado.');
    const data: { name?: string; key?: string; status?: string; quantity?: string | null } = {};
    if (patch.name !== undefined) {
      const clean = cleanItemName(patch.name);
      if (clean.length < 2 || clean.length > 60) throw badRequest('Nome do item inválido.');
      const key = normalize(clean);
      const other = await this.db.pantryItem.findUnique({ where: { key } });
      if (other && other.id !== id) throw badRequest(`Já existe “${other.name}” na lista.`);
      Object.assign(data, { name: clean, key });
    }
    if (patch.status) data.status = patch.status;
    if (patch.quantity !== undefined) data.quantity = patch.quantity?.trim().slice(0, 30) || null;
    const row = await this.db.pantryItem.update({ where: { id }, data });
    this.onChange();
    return toItem(row);
  }

  async removeItem(id: string) {
    const r = await this.db.pantryItem.deleteMany({ where: { id } });
    if (!r.count) throw notFound('Item não encontrado.');
    this.onChange();
    return { ok: true };
  }

  /** “Comprei tudo”: tudo o que estava para comprar passa para “em casa” */
  async boughtAll() {
    const r = await this.db.pantryItem.updateMany({ where: { status: 'buy' }, data: { status: 'have' } });
    this.onChange();
    return { count: r.count };
  }

  /** Acha itens pelo nome falado (exato, depois parcial) */
  private async find(name: string): Promise<ItemRow | null> {
    const key = normalize(cleanItemName(name));
    if (!key) return null;
    const exact = await this.db.pantryItem.findUnique({ where: { key } });
    if (exact) return exact;
    const all = await this.db.pantryItem.findMany();
    return all.find((i) => i.key.includes(key) || key.includes(i.key)) ?? null;
  }

  // ---- Notas ----

  async notes(): Promise<NoteDto[]> {
    return (await this.db.note.findMany({ orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] })).map(toNote);
  }

  async addNote(text: string) {
    const t = text.trim();
    if (!t || t.length > 4000) throw badRequest('A nota precisa ter até 4000 caracteres.');
    const row = await this.db.note.create({ data: { text: t } });
    this.onChange();
    return toNote(row);
  }

  async updateNote(id: string, patch: { text?: string; pinned?: boolean }) {
    if (!(await this.db.note.findUnique({ where: { id } }))) throw notFound('Nota não encontrada.');
    const text = patch.text?.trim();
    if (patch.text !== undefined && (!text || text.length > 4000)) throw badRequest('A nota precisa ter até 4000 caracteres.');
    const row = await this.db.note.update({ where: { id }, data: { ...(text ? { text } : {}), ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}) } });
    this.onChange();
    return toNote(row);
  }

  async removeNote(id: string) {
    const r = await this.db.note.deleteMany({ where: { id } });
    if (!r.count) throw notFound('Nota não encontrada.');
    this.onChange();
    return { ok: true };
  }

  // ---- Voz ----

  async voice(cmd: { command: 'buy' | 'bought' | 'list_buy' | 'has' | 'note' | 'list_notes'; text: string }): Promise<string> {
    switch (cmd.command) {
      case 'buy': {
        const names = splitItems(cmd.text);
        if (!names.length) return 'Não entendi o que é para pôr na lista. Pode repetir?';
        for (const n of names) await this.upsertItem(n, 'buy');
        return `Coloquei ${listJoin(names.map((n) => n.toLocaleLowerCase('pt-BR')))} na lista de compras.`;
      }
      case 'bought': {
        const names = splitItems(cmd.text);
        if (!names.length) return 'Não entendi o que você comprou.';
        for (const n of names) {
          const found = await this.find(n);
          if (found) await this.updateItem(found.id, { status: 'have' });
          else await this.upsertItem(n, 'have');
        }
        const left = (await this.items()).filter((i) => i.status === 'buy').length;
        return `Anotei que ${names.length === 1 ? 'tem' : 'tem'} ${listJoin(names.map((n) => n.toLocaleLowerCase('pt-BR')))} em casa.${left ? ` Ainda ${left === 1 ? 'falta 1 item' : `faltam ${left} itens`} na lista de compras.` : ' A lista de compras está vazia.'}`;
      }
      case 'list_buy': {
        const buy = (await this.items()).filter((i) => i.status === 'buy');
        if (!buy.length) return 'A lista de compras está vazia.';
        const names = buy.map((i) => (i.quantity ? `${i.quantity} de ${i.name}` : i.name).toLocaleLowerCase('pt-BR'));
        return `Falta comprar ${buy.length === 1 ? '' : `${buy.length} itens: `}${listJoin(names.slice(0, 15))}${buy.length > 15 ? ' e mais alguns' : ''}.`;
      }
      case 'has': {
        const found = await this.find(cmd.text);
        const name = cleanItemName(cmd.text).toLocaleLowerCase('pt-BR');
        if (!found) return `Não tenho ${name} anotado na lista da casa.`;
        return found.status === 'have' ? `Tem ${found.name.toLocaleLowerCase('pt-BR')} em casa${found.quantity ? ` (${found.quantity})` : ''}.` : `${found.name} está na lista de compras: acabou.`;
      }
      case 'note': {
        const n = await this.addNote(cmd.text.charAt(0).toLocaleUpperCase('pt-BR') + cmd.text.slice(1));
        return `Nota criada: “${n.text}”.`;
      }
      case 'list_notes': {
        const ns = await this.notes();
        if (!ns.length) return 'Não há notas guardadas.';
        const read = ns.slice(0, 5).map((n, i) => `${i + 1}: ${n.text.length > 120 ? `${n.text.slice(0, 120)}…` : n.text}`);
        return `${ns.length === 1 ? 'Você tem uma nota' : `Você tem ${ns.length} notas`}. ${read.join('. ')}.`;
      }
    }
  }
}
