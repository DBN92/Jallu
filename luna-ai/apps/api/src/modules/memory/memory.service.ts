import type { MemoryDto } from '@luna/shared';
import type { Db } from '../../lib/db';
import { AppError, notFound } from '../../lib/errors';
import { normalize } from '../../lib/text';

/** Padrões de dados sensíveis que a Luna se recusa a memorizar sem confirmação explícita. */
const SENSITIVE: { re: RegExp; label: string }[] = [
  { re: /\b(senha|password|pin|token|api[ _-]?key|chave secreta)\b/i, label: 'senha ou credencial' },
  { re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, label: 'CPF' },
  { re: /\b(?:\d[ -]?){13,19}\b/, label: 'número de cartão' },
  { re: /\b(cvv|cvc|código de segurança)\b/i, label: 'dado de cartão' },
];

export function detectSensitive(text: string): string | null {
  for (const s of SENSITIVE) if (s.re.test(text)) return s.label;
  return null;
}

export class MemoryService {
  constructor(private readonly db: Db) {}

  async list(userId: string, type?: string): Promise<MemoryDto[]> {
    const rows = await this.db.memory.findMany({
      where: { userId, ...(type ? { type } : {}), OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ id: r.id, type: r.type as MemoryDto['type'], content: r.content, source: r.source, createdAt: r.createdAt.toISOString() }));
  }

  async add(userId: string, input: { type: MemoryDto['type']; content: string; source?: string; allowSensitive?: boolean; ttlHours?: number }) {
    const sensitive = detectSensitive(input.content);
    if (sensitive && !input.allowSensitive) {
      throw new AppError(422, `Isso parece conter ${sensitive}. Por segurança, não vou memorizar.`, 'sensitive_memory');
    }
    const existing = await this.db.memory.findMany({ where: { userId, type: input.type } });
    const norm = normalize(input.content);
    const dup = existing.find((m) => normalize(m.content) === norm);
    if (dup) return { id: dup.id, type: dup.type as MemoryDto['type'], content: dup.content, source: dup.source, createdAt: dup.createdAt.toISOString() };
    const row = await this.db.memory.create({
      data: {
        userId,
        type: input.type,
        content: input.content.trim(),
        source: input.source ?? 'user',
        expiresAt: input.ttlHours ? new Date(Date.now() + input.ttlHours * 3600_000) : null,
      },
    });
    return { id: row.id, type: row.type as MemoryDto['type'], content: row.content, source: row.source, createdAt: row.createdAt.toISOString() };
  }

  async remove(userId: string, id: string) {
    const r = await this.db.memory.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw notFound('Memória não encontrada.');
  }

  async clear(userId: string) {
    const r = await this.db.memory.deleteMany({ where: { userId } });
    return r.count;
  }

  /** Remove memórias que contenham o trecho (usado por "esqueça que ..."). */
  async forgetMatching(userId: string, fragment: string) {
    const all = await this.db.memory.findMany({ where: { userId } });
    const f = normalize(fragment);
    const ids = all.filter((m) => normalize(m.content).includes(f)).map((m) => m.id);
    if (ids.length) await this.db.memory.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  }

  /** Bloco de contexto para o prompt — somente memórias explicitamente salvas. */
  async promptContext(userId: string): Promise<string> {
    const items = await this.list(userId);
    if (!items.length) return 'Nenhuma memória salva.';
    const label: Record<string, string> = { preference: 'Preferência', fact: 'Informação', home: 'Casa', context: 'Contexto', summary: 'Resumo de conversa' };
    return items.slice(0, 40).map((m) => `- [${label[m.type] ?? m.type}] ${m.content}`).join('\n');
  }
}
