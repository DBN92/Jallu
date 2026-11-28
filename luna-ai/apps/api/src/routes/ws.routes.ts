import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { ServerEvent } from '@luna/shared';
import { SESSION_COOKIE } from '../modules/auth/auth.service';

/** Hub de WebSocket para eventos em tempo real (estados de dispositivos, estado da assistente). */
export class RealtimeHub {
  private clients = new Map<WebSocket, string>();

  add(ws: WebSocket, userId: string) {
    this.clients.set(ws, userId);
    ws.on('close', () => this.clients.delete(ws));
  }

  broadcast(event: ServerEvent) {
    const data = JSON.stringify(event);
    for (const ws of this.clients.keys()) if (ws.readyState === 1) ws.send(data);
  }

  toUser(userId: string, event: ServerEvent) {
    const data = JSON.stringify(event);
    for (const [ws, uid] of this.clients) if (uid === userId && ws.readyState === 1) ws.send(data);
  }

  get size() {
    return this.clients.size;
  }
}

export async function wsRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    // Autenticação pelo cookie de sessão (mesma origem); verificação de Origin contra CSWSH
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    let allowed = !origin;
    if (origin) {
      try {
        allowed = new URL(origin).host === host || (!!app.env.LUNA_PUBLIC_URL && origin === new URL(app.env.LUNA_PUBLIC_URL).origin);
      } catch {
        allowed = false;
      }
    }
    const session = allowed ? await app.services.auth.resolveSession(req.cookies[SESSION_COOKIE]) : null;
    if (!session) {
      socket.close(4401, 'unauthorized');
      return;
    }
    app.services.hub.add(socket, session.user.id);
    socket.send(JSON.stringify({ type: 'hello', user: session.user } satisfies ServerEvent));
    socket.send(JSON.stringify({ type: 'ha_status', connected: app.services.haWs.connected } satisfies ServerEvent));
    socket.on('message', (raw) => {
      if (raw.toString() === 'ping') socket.send('pong');
    });
  });
}
