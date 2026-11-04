import type { Db } from '../../lib/db';
import { truncate } from '../../lib/text';

export interface ActionLogEntry {
  userId?: string | null;
  source: string;
  tool: string;
  target?: string | null;
  args?: unknown;
  success: boolean;
  detail?: string | null;
}

export class ActionLogService {
  constructor(private readonly db: Db) {}

  async log(entry: ActionLogEntry) {
    await this.db.actionLog
      .create({
        data: {
          userId: entry.userId ?? null,
          source: entry.source,
          tool: entry.tool,
          target: entry.target ?? null,
          args: entry.args === undefined ? null : truncate(JSON.stringify(entry.args), 1000),
          success: entry.success,
          detail: entry.detail ? truncate(entry.detail, 500) : null,
        },
      })
      .catch(() => undefined);
  }

  async recent(limit = 100) {
    const rows = await this.db.actionLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      tool: r.tool,
      target: r.target,
      success: r.success,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
