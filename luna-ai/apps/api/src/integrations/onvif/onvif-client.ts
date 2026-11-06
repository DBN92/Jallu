import { createHash, randomBytes } from 'node:crypto';
import { connect } from 'node:net';
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
    let res: { status: number; text: string };
    try {
      res = await lenientPost(url, envelope, this.timeoutMs);
    } catch (err) {
      const msg = `${(err as Error).message} ${(err as NodeJS.ErrnoException).code ?? ''}`;
      if (/timeout|ETIMEDOUT/i.test(msg)) throw new OnvifError('não respondeu (tempo esgotado)');
      if (/ECONNREFUSED|refused/i.test(msg)) throw new OnvifError('porta fechada');
      if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) throw new OnvifError('falha de conexão: câmera fora da rede');
      throw new OnvifError(`falha de conexão: ${msg.trim()}`);
    }
    const text = res.text;
    if (res.status === 401 || /NotAuthorized|not authorized|Sender not Authorized/i.test(text)) throw new OnvifError('usuário ou senha ONVIF incorretos');
    if (res.status >= 400 || /<(?:\w+:)?Fault\b/.test(text)) {
      throw new OnvifError(`a câmera recusou o comando: ${tagText(text, 'Text') ?? `HTTP ${res.status}`}`);
    }
    if (!/Envelope/i.test(text)) throw new OnvifError('resposta inválida da câmera (não é ONVIF)');
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
    // Algumas câmeras baratas não anunciam o PTZ, mas atendem no endereço padrão
    const ptzAddr = tagText(section('PTZ'), 'XAddr') ?? `${this.base()}/onvif/ptz_service`;
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

/**
 * POST HTTP “tolerante”: muitas câmeras (ex.: Yoosee) respondem com HTTP fora do padrão
 * (cabeçalhos quebrados, Content-Length errado, conexão fechada no meio), que o fetch do Node recusa.
 * Aqui se lê tudo até a câmera fechar e só se extrai o status e o XML.
 */
export function lenientPost(url: string, body: string, timeoutMs: number): Promise<{ status: number; text: string }> {
  const u = new URL(url);
  const payload = Buffer.from(body, 'utf8');
  const head =
    `POST ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nContent-Type: application/soap+xml; charset=utf-8\r\n` +
    `Content-Length: ${payload.length}\r\nConnection: close\r\nUser-Agent: DIA\r\n\r\n`;
  return new Promise((resolvePost, reject) => {
    const sock = connect({ host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port) || 80 });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      const raw = Buffer.concat(chunks);
      if (!raw.length) return reject(err ?? new Error('a câmera fechou a conexão sem responder'));
      resolvePost(parseHttp(raw));
    };
    const timer = setTimeout(() => {
      const e = new Error('timeout') as NodeJS.ErrnoException;
      e.code = 'ETIMEDOUT';
      finish(e);
    }, timeoutMs);
    sock.on('connect', () => sock.write(Buffer.concat([Buffer.from(head, 'latin1'), payload])));
    sock.on('data', (d: Buffer) => {
      chunks.push(d);
      // Resposta completa (com Content-Length correto) — não espera a câmera fechar
      const raw = Buffer.concat(chunks).toString('latin1');
      const sep = raw.search(/\r?\n\r?\n/);
      const len = raw.match(/content-length:\s*(\d+)/i);
      if (sep >= 0 && len && Buffer.byteLength(raw.slice(raw.indexOf('\n', sep + 1) + 1), 'latin1') >= Number(len[1]) && /<\/(?:[\w-]+:)?Envelope>/.test(raw)) finish();
    });
    sock.on('end', () => finish());
    sock.on('close', () => finish());
    sock.on('error', (e) => finish(e));
  });
}

function parseHttp(raw: Buffer): { status: number; text: string } {
  const s = raw.toString('utf8');
  const status = Number(s.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)?.[1] ?? 200);
  const m = s.match(/\r?\n\r?\n/);
  let headers = m ? s.slice(0, m.index) : '';
  let body = m ? s.slice(m.index! + m[0].length) : s;
  if (!/^HTTP\//.test(s)) (headers = ''), (body = s);
  if (/transfer-encoding:\s*chunked/i.test(headers)) {
    let out = '';
    let rest = body;
    for (;;) {
      const nl = rest.indexOf('\r\n');
      if (nl < 0) break;
      const size = parseInt(rest.slice(0, nl), 16);
      if (!size) break;
      out += rest.slice(nl + 2, nl + 2 + size);
      rest = rest.slice(nl + 2 + size + 2);
    }
    body = out || body;
  }
  return { status, text: body };
}

function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** Portas ONVIF mais comuns (Yoosee usa 5000). */
export const ONVIF_PORTS = [5000, 80, 8899, 8000, 8080, 2020];
