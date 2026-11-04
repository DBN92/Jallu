import type { ServerEvent } from '@luna/shared';

type Handler = (e: ServerEvent) => void;

/** WebSocket com reconexão automática para eventos em tempo real. */
export class LunaSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private timer: number | null = null;
  private pingTimer: number | null = null;
  private closed = false;
  connected = false;

  constructor(
    private readonly onEvent: Handler,
    private readonly onStatus: (connected: boolean) => void,
  ) {}

  start() {
    this.closed = false;
    this.connect();
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop() {
    this.closed = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.timer) clearTimeout(this.timer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }

  // iOS suspende conexões em segundo plano; reconecta ao voltar
  private onVisible = () => {
    if (document.visibilityState === 'visible' && (!this.ws || this.ws.readyState > 1)) {
      this.attempts = 0;
      this.connect();
    }
  };

  private connect() {
    if (this.timer) clearTimeout(this.timer);
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.connected = true;
      this.onStatus(true);
      this.pingTimer = window.setInterval(() => ws.readyState === 1 && ws.send('ping'), 25_000);
    };
    ws.onmessage = (m) => {
      if (m.data === 'pong') return;
      try {
        this.onEvent(JSON.parse(m.data as string) as ServerEvent);
      } catch {
        /* ignora */
      }
    };
    ws.onclose = (ev) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.connected = false;
      this.onStatus(false);
      if (this.closed || ev.code === 4401) return;
      const delay = Math.min(30_000, 1000 * 2 ** this.attempts++);
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
  }
}
