import { createHash, randomBytes } from 'node:crypto';
import type { PtzAction } from '@luna/shared';

/**
 * Cliente ONVIF mínimo (SOAP 1.2 + WS-Security UsernameToken com digest) só para movimento:
 * descobre o serviço PTZ e o perfil de mídia, e envia ContinuousMove/Stop.
 * Sem dependências externas; a senha nunca trafega em texto (só o digest).
 */
export class OnvifError extends Error {}

const NS = {
  device: 'http://www.onvif.org/ver10/device/wsdl',
  media: 'http://www.onvif.org/ver10/media/wsdl',
  ptz: 'http://www.onvif.org/ver20/ptz/wsdl',
  schema: 'http://www.onvif.org/ver10/schema',
};

/** Texto do primeiro elemento com este nome (ignora prefixos de namespace). */
const tagText = (xml: string, tag: string) => xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([^<]*)</(?:[\\w-]+:)?${tag}>`))?.[1]?.trim() ?? null;

export interface OnvifTarget {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
}

interface Resolved {
  ptzUrl: string;
  profile: string;
  clockOffsetMs: number;
}

export class OnvifClient {
  private resolved: Resolved | null = null;

  constructor(
    private readonly target: OnvifTarget,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 6000,
  ) {}

  private security(offsetMs: number) {
    const { username, password } = this.target;
    if (!username) return '';
    const nonce = randomBytes(16);
    const created = new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const digest = createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(password ?? '')])).digest('base64');
    return `<s:Header><wsse:Security s:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><wsse:UsernameToken><wsse:Username>${xmlEscape(username)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password><wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</wsse:Nonce><wsu:Created>${created}</wsu:Created></wsse:UsernameToken></wsse:Security></s:Header>`;
  }

  private async call(url: string, body: string, auth: boolean, offsetMs = 0): Promise<string> {
    const envelope = `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">${auth ? this.security(offsetMs) : ''}<s:Body>${body}</s:Body></s:Envelope>`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/soap+xml; charset=utf-8' },
        body: envelope,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // O fetch do Node esconde o motivo real em err.cause (ECONNREFUSED, EHOSTUNREACH…)
      const msg = `${(err as Error).message} ${(err as { cause?: { code?: string; message?: string } }).cause?.code ?? ''}`;
      if (/abort|timeout|ETIMEDOUT/i.test(msg)) throw new OnvifError('não respondeu (tempo esgotado)');
      if (/ECONNREFUSED|refused/i.test(msg)) throw new OnvifError('porta fechada');
      if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) throw new OnvifError('falha de conexão: câmera fora da rede');
      throw new OnvifError(`falha de conexão: ${msg.trim()}`);
    }
    const text = await res.text();
    if (!res.ok) {
      const reason = tagText(text, 'Text') ?? `HTTP ${res.status}`;
      if (res.status === 401 || /NotAuthorized|not authorized|Sender not Authorized/i.test(text)) throw new OnvifError('usuário ou senha ONVIF incorretos');
      throw new OnvifError(`a câmera recusou o comando: ${reason}`);
    }
    return text;
  }

  private base() {
    return `http://${this.target.host.includes(':') ? `[${this.target.host}]` : this.target.host}:${this.target.port}`;
  }

  /** Corrige endereços que a câmera devolve com IP/porta internos. */
  private fixAddr(addr: string) {
    try {
      const u = new URL(addr);
      return `${this.base()}${u.pathname}${u.search}`;
    } catch {
      return `${this.base()}/onvif/ptz_service`;
    }
  }

  /** Descobre o serviço PTZ e o perfil (com cache). */
  async resolve(): Promise<Resolved> {
    if (this.resolved) return this.resolved;
    const device = `${this.base()}/onvif/device_service`;
    // Diferença de relógio (o digest usa a hora; câmeras costumam estar com a hora errada)
    let clockOffsetMs = 0;
    try {
      const t = await this.call(device, `<GetSystemDateAndTime xmlns="${NS.device}"/>`, false);
      const utc = t.match(/<(?:\w+:)?UTCDateTime>([\s\S]*?)<\/(?:\w+:)?UTCDateTime>/)?.[1];
      if (utc) {
        const n = (tag: string) => Number(tagText(utc, tag));
        const cam = Date.UTC(n('Year'), n('Month') - 1, n('Day'), n('Hour'), n('Minute'), n('Second'));
        if (Number.isFinite(cam)) clockOffsetMs = cam - Date.now();
      }
    } catch (err) {
      if (err instanceof OnvifError && /fechada|tempo esgotado|conexão/.test(err.message)) throw err;
    }
    const caps = await this.call(device, `<GetCapabilities xmlns="${NS.device}"><Category>All</Category></GetCapabilities>`, true, clockOffsetMs);
    const section = (name: string) => caps.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1] ?? '';
    const ptzAddr = tagText(section('PTZ'), 'XAddr');
    if (!ptzAddr) throw new OnvifError('esta câmera não informa controle de movimento (PTZ) no ONVIF');
    const mediaAddr = tagText(section('Media'), 'XAddr') ?? `${this.base()}/onvif/media_service`;
    const profiles = await this.call(this.fixAddr(mediaAddr), `<GetProfiles xmlns="${NS.media}"/>`, true, clockOffsetMs);
    const profile = profiles.match(/<(?:\w+:)?Profiles\b[^>]*\btoken="([^"]+)"/)?.[1];
    if (!profile) throw new OnvifError('nenhum perfil de vídeo encontrado no ONVIF');
    this.resolved = { ptzUrl: this.fixAddr(ptzAddr), profile, clockOffsetMs };
    return this.resolved;
  }

  async move(action: PtzAction) {
    const r = await this.resolve();
    const token = `<ProfileToken>${xmlEscape(r.profile)}</ProfileToken>`;
    if (action === 'stop') {
      await this.call(r.ptzUrl, `<Stop xmlns="${NS.ptz}">${token}<PanTilt>true</PanTilt><Zoom>true</Zoom></Stop>`, true, r.clockOffsetMs);
      return;
    }
    const v = 0.6;
    const velocity =
      action === 'zoom_in' || action === 'zoom_out'
        ? `<Zoom xmlns="${NS.schema}" x="${action === 'zoom_in' ? v : -v}"/>`
        : `<PanTilt xmlns="${NS.schema}" x="${action === 'left' ? -v : action === 'right' ? v : 0}" y="${action === 'up' ? v : action === 'down' ? -v : 0}"/>`;
    await this.call(r.ptzUrl, `<ContinuousMove xmlns="${NS.ptz}">${token}<Velocity>${velocity}</Velocity><Timeout>PT2S</Timeout></ContinuousMove>`, true, r.clockOffsetMs);
  }
}

function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** Portas ONVIF mais comuns (Yoosee usa 5000). */
export const ONVIF_PORTS = [5000, 80, 8899, 8000, 8080, 2020];
