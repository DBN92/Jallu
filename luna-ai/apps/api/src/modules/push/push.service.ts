import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';
import type { Db } from '../../lib/db';
import { badRequest } from '../../lib/errors';

export interface PushMessage {
  title: string;
  body: string;
  /** Tela que abre ao tocar no aviso */
  url: string;
  /** Avisos com a mesma etiqueta se substituem no celular */
  tag?: string;
}

type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

/** Só serviços de push dos navegadores (Apple, Google, Mozilla, Microsoft): nada de endereço qualquer */
const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//;

/**
 * Avisos no celular (Web Push do app instalado). As chaves (VAPID) são criadas na primeira vez e
 * ficam em data/vapid.json. O aviso passa pelo serviço de push do próprio celular (Apple/Google),
 * gratuito, só com o texto curto do aviso.
 */
export class PushService {
  private keys: { publicKey: string; privateKey: string };
  private send: Sender;

  constructor(
    private readonly db: Db,
    dataDir: string,
    sender?: Sender,
  ) {
    const file = join(dataDir, 'vapid.json');
    if (existsSync(file)) this.keys = JSON.parse(readFileSync(file, 'utf8'));
    else {
      this.keys = webpush.generateVAPIDKeys();
      try {
        writeFileSync(file, JSON.stringify(this.keys), { mode: 0o600 });
      } catch {
        /* sem pasta de dados (testes): chaves só na memória */
      }
    }
    this.send =
      sender ??
      ((sub, payload) =>
        webpush.sendNotification(sub, payload, { vapidDetails: { subject: 'mailto:luna@localhost', publicKey: this.keys.publicKey, privateKey: this.keys.privateKey }, TTL: 6 * 3600, urgency: 'high' }));
  }

  get publicKey() {
    return this.keys.publicKey;
  }

  async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, label: string | null) {
    if (!PUSH_HOSTS.test(sub.endpoint)) throw badRequest('Endereço de notificação não reconhecido.');
    await this.db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label },
    });
    return { ok: true };
  }

  async unsubscribe(endpoint: string) {
    await this.db.pushSubscription.deleteMany({ where: { endpoint } });
    return { ok: true };
  }

  async count(userId: string) {
    return this.db.pushSubscription.count({ where: { userId } });
  }

  /** Manda para todos os aparelhos da casa (menos o que pediu, se informado). Inscrições vencidas são apagadas. */
  async broadcast(msg: PushMessage, opts: { exceptEndpoint?: string; userId?: string } = {}) {
    const subs = await this.db.pushSubscription.findMany({ where: opts.userId ? { userId: opts.userId } : {} });
    let sent = 0;
    await Promise.all(
      subs
        .filter((s) => s.endpoint !== opts.exceptEndpoint)
        .map(async (s) => {
          try {
            await this.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg));
            sent++;
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) await this.db.pushSubscription.deleteMany({ where: { id: s.id } });
          }
        }),
    );
    return { sent };
  }
}
