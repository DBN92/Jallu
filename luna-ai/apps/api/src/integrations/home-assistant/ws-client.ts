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
/** Entrada do registro de entidades do HA (o que a DIA usa dele). */
export interface RegistryEntry {
  platform: string;
  hidden: boolean;
  /** Aparelho físico ao qual a entidade pertence (liga a bateria ao robô, por exemplo) */
  deviceId: string | null;
  /** config | diagnostic | null */
  category: string | null;
}

export class HomeAssistantWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private registryCache: { at: number; map: Map<string, RegistryEntry> } | null = null;
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

  /** Registro de entidades do HA (integração de origem, ocultas/desativadas). Cache de 5 min. */
  async registry(): Promise<Map<string, RegistryEntry>> {
    if (this.registryCache && Date.now() - this.registryCache.at < 5 * 60_000) return this.registryCache.map;
    try {
      const list = await this.command<{ entity_id: string; platform: string; hidden_by?: string | null; disabled_by?: string | null; device_id?: string | null; entity_category?: string | null }[]>({
        type: 'config/entity_registry/list',
      });
      const map = new Map(
        list.map((e) => [e.entity_id, { platform: e.platform, hidden: Boolean(e.hidden_by || e.disabled_by), deviceId: e.device_id ?? null, category: e.entity_category ?? null }]),
      );
      this.registryCache = { at: Date.now(), map };
      return map;
    } catch {
      return this.registryCache?.map ?? new Map();
    }
  }

  /**
   * Entidades que o próprio Home Assistant oculta (ex.: a tomada original quando você usa
   * “mudar tipo de dispositivo” para virar luz).
   */
  async hiddenEntities(): Promise<Set<string>> {
    const reg = await this.registry();
    return new Set([...reg].filter(([, v]) => v.hidden).map(([k]) => k));
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
