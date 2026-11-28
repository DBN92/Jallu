import { createHash, randomBytes } from 'node:crypto';
import type { PublicUser } from '@luna/shared';
import type { Db } from '../../lib/db';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { toPublicUser } from '../auth/auth.service';
import { timeReply } from '../ai/chat.service';
import type { ChatService } from '../ai/chat.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const MAX_TOKENS = 10;
/** Pedidos seguidos pela Siri dentro deste tempo continuam a mesma conversa (ex.: responder “qual luz?”). */
const FOLLOW_UP_MS = 3 * 60_000;

export interface ApiTokenDto {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Texto para a Siri falar: sem markdown, emojis nem símbolos; “LUNA” lido como “Luna”. */
export function forSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#`>~|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\bLUNA\b/g, 'Luna')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Siri e app Atalhos: tokens próprios (não a senha) que SÓ servem para mandar comandos à Luna.
 * O token aparece uma única vez; no banco fica apenas o hash. Pode ser revogado a qualquer momento.
 */
export class SiriService {
  private recent = new Map<string, { conversationId: string; at: number }>();

  constructor(
    private readonly db: Db,
    private readonly chat: ChatService,
  ) {}

  // ---------- Fala pronta antes da pergunta (hora e clima) ----------
  /** Quem falou com a Luna pelo tablet/Siri e quando (o pré-aquecimento só roda com uso recente) */
  private lastVoice = new Map<string, number>();
  private prewarmTimer: NodeJS.Timeout | null = null;
  private lastWeather = 0;
  /** Resposta pronta: o app vai pedir a voz dela em seguida */
  onAnswer: ((text: string) => void) | null = null;

  /**
   * Hora e clima respondem na hora: a voz do minuto seguinte (“Agora são 21:16.”) é gerada antes do
   * minuto virar, e as frases do clima depois de cada atualização da previsão. Só enquanto alguém usou
   * a voz nas últimas 3 h (o processador do servidor é antigo).
   */
  startPrewarm(speak: (text: string) => Promise<unknown>, available: () => boolean, timeZone: string) {
    if (this.prewarmTimer) return;
    this.prewarmTimer = setInterval(() => void this.prewarmTick(speak, available, timeZone), 15_000);
    this.prewarmTimer.unref();
  }

  /** Uma rodada do pré-aquecimento (exposta para teste) */
  async prewarmTick(speak: (text: string) => Promise<unknown>, available: () => boolean, timeZone: string, nowMs = Date.now()) {
    const now = nowMs;
    const active = [...this.lastVoice].filter(([, at]) => now - at < 3 * 3600_000).map(([id]) => id);
    if (!active.length || !available()) return;
    const sec = new Date(now).getSeconds();
    const minute = now - sec * 1000 - new Date(now).getMilliseconds();
    await speak(timeReply(new Date(minute), timeZone)).catch(() => undefined);
    if (sec >= 30) await speak(timeReply(new Date(minute + 60_000), timeZone)).catch(() => undefined);
    if (now - this.lastWeather > 4 * 60_000) {
      this.lastWeather = now;
      for (const userId of active) {
        for (const q of ['como está o tempo agora', 'qual a previsão do tempo para hoje', 'qual a previsão do tempo para amanhã']) {
          const reply = await this.chat.previewReply(userId, q).catch(() => null);
          if (reply) await speak(forSpeech(reply)).catch(() => undefined);
        }
      }
    }
  }

  stopPrewarm() {
    if (this.prewarmTimer) clearInterval(this.prewarmTimer);
    this.prewarmTimer = null;
  }

  private dto(t: { id: string; name: string; prefix: string; createdAt: Date; lastUsedAt: Date | null }): ApiTokenDto {
    return { id: t.id, name: t.name, prefix: t.prefix, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null };
  }

  async list(userId: string): Promise<ApiTokenDto[]> {
    return (await this.db.apiToken.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })).map((t) => this.dto(t));
  }

  async create(userId: string, name: string): Promise<{ token: string; info: ApiTokenDto }> {
    if ((await this.db.apiToken.count({ where: { userId } })) >= MAX_TOKENS) throw badRequest(`Limite de ${MAX_TOKENS} tokens. Apague um que não usa mais.`);
    const token = `luna_${randomBytes(32).toString('base64url')}`;
    const row = await this.db.apiToken.create({ data: { userId, name: name.trim().slice(0, 40) || 'iPhone', tokenHash: sha256(token), prefix: token.slice(0, 11) } });
    return { token, info: this.dto(row) };
  }

  async revoke(userId: string, id: string) {
    const r = await this.db.apiToken.deleteMany({ where: { id, userId } });
    if (!r.count) throw notFound('Token não encontrado.');
  }

  /** Valida o cabeçalho “Authorization: Bearer luna_…”. */
  async resolve(header: string | undefined): Promise<PublicUser> {
    // “luna_” (atual) ou “dia_” (tokens criados antes da volta do nome — continuam valendo)
    const token = header?.match(/^Bearer\s+((?:luna|dia)_[A-Za-z0-9_-]{20,})$/)?.[1];
    if (!token) throw new AppError(401, 'Token da Luna ausente ou inválido. Crie um em Configurações › Siri e Atalhos.', 'unauthenticated');
    const row = await this.db.apiToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row) throw new AppError(401, 'Este token foi apagado ou não existe. Crie outro em Configurações › Siri e Atalhos.', 'unauthenticated');
    await this.db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    return toPublicUser(row.user);
  }

  /** Recebe o que foi dito para a Siri e devolve a resposta da Luna pronta para ser falada. */
  async ask(user: PublicUser, text: string): Promise<string> {
    const message = text.trim();
    if (!message) return 'Não ouvi nada. Tente de novo.';
    const prev = this.recent.get(user.id);
    const conversationId = prev && Date.now() - prev.at < FOLLOW_UP_MS ? prev.conversationId : undefined;
    let res;
    try {
      res = await this.chat.handle(user, { message: message.slice(0, 1000), channel: 'voice', conversationId });
    } catch (err) {
      if (conversationId && err instanceof AppError && err.statusCode === 404) {
        res = await this.chat.handle(user, { message: message.slice(0, 1000), channel: 'voice' });
      } else throw err;
    }
    this.recent.set(user.id, { conversationId: res.conversationId, at: Date.now() });
    this.lastVoice.set(user.id, Date.now());
    const answer = forSpeech(res.reply) || 'Pronto.';
    // Começa a gerar a voz já (o app pede o áudio logo em seguida e pega a mesma geração)
    this.onAnswer?.(answer);
    return answer;
  }
}
