import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { HaStateChangedEvent } from './types';

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
}

/**
 * Cliente WebSocket do Home Assistant: autentica, assina "state_changed"
 * e reconecta automaticamente com backoff exponencial.
 * Eventos: 'state_changed' (HaStateChangedEvent), 'connected', 'disconnected'.
 */
export class HomeAssistantWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private hiddenCache: { at: number; ids: Set<string> } | null = null;
  private attempts = 0;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  connected = false;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly log: Logger,
  ) {
    super();
  }

  get url(): string {
    return `${this.baseUrl.replace(/^http/, 'ws')}/api/websocket`;
  }

  start() {
    if (!this.baseUrl || !this.token) {
      this.log.warn('Home Assistant WebSocket desativado: HA_URL/HA_TOKEN ausentes.');
      return;
    }
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }

  private connect() {
    const ws = new WebSocket(this.url, { handshakeTimeout: 10_000 });
    this.ws = ws;

    ws.on('message', (raw) => {
      let msg: { type: string; id?: number; event?: { event_type: string; data: HaStateChangedEvent }; success?: boolean; message?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case 'auth_required':
          ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
          break;
        case 'auth_ok':
          this.attempts = 0;
          this.connected = true;
          ws.send(JSON.stringify({ id: this.msgId++, type: 'subscribe_events', event_type: 'state_changed' }));
          this.pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: this.msgId++, type: 'ping' }));
          }, 30_000);
          this.log.info('Conectado ao WebSocket do Home Assistant.');
          this.emit('connected');
          break;
        case 'auth_invalid':
          this.log.warn(`Home Assistant recusou o token: ${msg.message ?? ''}`);
          ws.close();
          break;
        case 'result': {
          const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(msg.id!);
            const r = msg as unknown as { success: boolean; result?: unknown; error?: { message?: string } };
            if (r.success) p.resolve(r.result);
            else p.reject(new Error(r.error?.message ?? 'falha no comando'));
          }
          break;
        }
        case 'event':
          if (msg.event?.event_type === 'state_changed') this.emit('state_changed', msg.event.data);
          break;
      }
    });

    ws.on('close', () => this.handleDisconnect());
    ws.on('error', (err) => this.log.warn(`WebSocket do Home Assistant: ${err.message}`));
  }

  /** Envia um comando pelo WebSocket e aguarda o resultado. */
  command<T>(payload: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || !this.connected || this.ws.readyState !== WebSocket.OPEN) return reject(new Error('WebSocket do HA desconectado'));
      const id = this.msgId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('tempo esgotado'));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.ws.send(JSON.stringify({ id, ...payload }));
    });
  }

  /**
   * Entidades que o próprio Home Assistant oculta (ex.: a tomada original quando você usa
   * “mudar tipo de dispositivo” para virar luz). Cache de 5 min; vazio se não der para consultar.
   */
  async hiddenEntities(): Promise<Set<string>> {
    if (this.hiddenCache && Date.now() - this.hiddenCache.at < 5 * 60_000) return this.hiddenCache.ids;
    try {
      const list = await this.command<{ entity_id: string; hidden_by?: string | null; disabled_by?: string | null }[]>({ type: 'config/entity_registry/list' });
      const ids = new Set(list.filter((e) => e.hidden_by || e.disabled_by).map((e) => e.entity_id));
      this.hiddenCache = { at: Date.now(), ids };
      return ids;
    } catch {
      return this.hiddenCache?.ids ?? new Set();
    }
  }

  private handleDisconnect() {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('WebSocket do HA desconectado'));
      this.pending.delete(id);
    }
    if (this.pingTimer) clearInterval(this.pingTimer);
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) this.emit('disconnected');
    if (this.stopped) return;
    const delay = Math.min(60_000, 1000 * 2 ** this.attempts++);
    this.timer = setTimeout(() => this.connect(), delay);
  }
}
