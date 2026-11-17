import { createHash, createHmac, randomUUID } from 'node:crypto';

/** Câmera (ou outro aparelho) da conta Smart Life ligada ao projeto na Tuya IoT Platform */
export interface TuyaDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
}

export class TuyaCloudError extends Error {}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Cliente da API oficial de nuvem da Tuya (Tuya IoT Platform / OpenAPI), usado para pedir o endereço de
 * vídeo (RTSP) de câmeras Smart Life que o Home Assistant não suporta. A chave (Access ID/Secret) fica só
 * no .env do servidor; o navegador nunca a recebe.
 * Assinatura: HMAC-SHA256 de client_id + [access_token] + t + nonce + (método, sha256 do corpo, cabeçalhos, url).
 */
export class TuyaCloud {
  private token: { value: string; uid: string; exp: number } | null = null;

  constructor(
    private readonly accessId: string,
    private readonly secret: string,
    private readonly endpoint: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  get configured() {
    return Boolean(this.accessId && this.secret);
  }

  /** Assinatura de uma chamada (exportada para teste) */
  sign(method: string, path: string, body: string, t: string, nonce: string, accessToken = '') {
    const [p, q] = path.split('?');
    const query = q ? q.split('&').sort().join('&') : '';
    const url = query ? `${p}?${query}` : p!;
    const stringToSign = [method.toUpperCase(), sha256(body), '', url].join('\n');
    return createHmac('sha256', this.secret).update(this.accessId + accessToken + t + nonce + stringToSign).digest('hex').toUpperCase();
  }

  private async raw<T>(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<T> {
    if (!this.configured) throw new TuyaCloudError('Nuvem Tuya não configurada: preencha TUYA_ACCESS_ID e TUYA_ACCESS_SECRET no .env do servidor.');
    const text = body === undefined ? '' : JSON.stringify(body);
    const t = String(Date.now());
    const nonce = randomUUID();
    const token = auth ? await this.accessToken() : '';
    const headers: Record<string, string> = { client_id: this.accessId, t, nonce, sign_method: 'HMAC-SHA256', sign: this.sign(method, path, text, t, nonce, token) };
    if (token) headers.access_token = token;
    if (text) headers['content-type'] = 'application/json';
    const res = await this.fetcher(this.endpoint + path, { method, headers, body: text || undefined, signal: AbortSignal.timeout(12_000) });
    const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T; msg?: string; code?: number } | null;
    if (!json?.success) {
      if (json?.code === 1010 || json?.code === 1011) this.token = null; // token vencido/inválido: renova na próxima
      throw new TuyaCloudError(`Nuvem Tuya recusou (${json?.code ?? res.status}): ${json?.msg ?? 'sem resposta'}`);
    }
    return json.result as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.exp) return this.token.value;
    const r = await this.raw<{ access_token: string; expire_time: number; uid: string }>('GET', '/v1.0/token?grant_type=1', undefined, false);
    this.token = { value: r.access_token, uid: r.uid, exp: Date.now() + Math.max(60, r.expire_time - 120) * 1000 };
    return r.access_token;
  }

  /** Aparelhos da conta Smart Life ligada ao projeto */
  async devices(): Promise<TuyaDevice[]> {
    const r = await this.raw<unknown>('GET', '/v1.0/iot-01/associated-users/devices?size=100');
    const list = (Array.isArray(r) ? r : ((r as { devices?: unknown[] })?.devices ?? [])) as Record<string, unknown>[];
    return list
      .filter((d) => typeof d.id === 'string')
      .map((d) => ({ id: d.id as string, name: String(d.name ?? d.id), category: String(d.category ?? ''), online: d.online !== false && d.is_online !== false }));
  }

  private owners = new Map<string, string>();

  /** Fonte para o go2rtc buscar o vídeo WebRTC (o mesmo do site/app) com a chave do projeto */
  async webrtcSource(deviceId: string): Promise<string> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    let uid = this.owners.get(deviceId);
    if (!uid) {
      // dono do aparelho (a conta Smart Life ligada); sem isso, o usuário do token
      const d = await this.raw<{ uid?: string }>('GET', `/v1.0/devices/${deviceId}`).catch(() => null);
      await this.accessToken();
      uid = d?.uid || this.token?.uid || '';
      if (!uid) throw new TuyaCloudError('Não achei a conta dona deste aparelho na nuvem Tuya.');
      this.owners.set(deviceId, uid);
    }
    const q = new URLSearchParams({ device_id: deviceId, uid, client_id: this.accessId, client_secret: this.secret });
    return `tuya://${new URL(this.endpoint).host}?${q.toString()}`;
  }

  /**
   * Endereço de vídeo ao vivo, válido por alguns minutos — pedido a cada vez que o vídeo abre.
   * rtsp (rtsps://, mais rápido) ou hls (https://…m3u8, alguns modelos só entregam este).
   */
  async streamUrl(deviceId: string, type: 'rtsp' | 'hls' = 'rtsp'): Promise<string> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    const r = await this.raw<{ url?: string }>('POST', `/v1.0/devices/${deviceId}/stream/actions/allocate`, { type });
    if (!r?.url) throw new TuyaCloudError('A nuvem Tuya não devolveu endereço de vídeo para este aparelho.');
    return r.url;
  }

  /** Comandos que o aparelho aceita (código, tipo) — direto da nuvem, sem chutar nomes */
  async functions(deviceId: string): Promise<{ code: string; type: string }[]> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    const r = await this.raw<{ functions?: { code: string; type: string }[] }>('GET', `/v1.0/devices/${deviceId}/functions`);
    return r?.functions ?? [];
  }

  /** Manda um comando ao aparelho (o mesmo caminho do app Smart Life) */
  async command(deviceId: string, code: string, value: unknown): Promise<void> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    const ok = await this.raw<boolean>('POST', `/v1.0/devices/${deviceId}/commands`, { commands: [{ code, value }] });
    if (ok === false) throw new TuyaCloudError('A nuvem Tuya não aceitou o comando.');
  }

  /** Propriedades do aparelho no “modelo de coisa” (os comandos internos dele, como o app usa) */
  async propertyCodes(deviceId: string): Promise<string[]> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    const r = await this.raw<{ model?: string }>('GET', `/v2.0/cloud/thing/${deviceId}/model`);
    try {
      const model = JSON.parse(r?.model ?? '{}') as { services?: { properties?: { code: string; accessMode?: string }[] }[] };
      return (model.services ?? []).flatMap((sv) => sv.properties ?? []).filter((p) => p.accessMode !== 'ro').map((p) => p.code);
    } catch {
      return [];
    }
  }

  /** Manda uma propriedade direto ao aparelho (independe do “modo de instrução” do projeto) */
  async setProperty(deviceId: string, code: string, value: unknown): Promise<void> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    await this.raw('POST', `/v2.0/cloud/thing/${deviceId}/shadow/properties/issue`, { properties: JSON.stringify({ [code]: value }) });
  }

  /** Estado atual de cada comando do aparelho (para descobrir o que o app muda) */
  async status(deviceId: string): Promise<{ code: string; value: unknown }[]> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    return (await this.raw<{ code: string; value: unknown }[]>('GET', `/v1.0/devices/${deviceId}/status`)) ?? [];
  }

  /** Modelo completo do aparelho (propriedades, tipos e valores aceitos) */
  async model(deviceId: string): Promise<unknown> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    const r = await this.raw<{ model?: string }>('GET', `/v2.0/cloud/thing/${deviceId}/model`);
    try {
      return JSON.parse(r?.model ?? 'null');
    } catch {
      return r;
    }
  }

  /** Valor atual de propriedades do aparelho (inclusive as próprias do fabricante, fora do padrão) */
  async getProperties(deviceId: string, codes: string[]): Promise<Record<string, unknown>> {
    if (!/^[a-z0-9]{10,40}$/i.test(deviceId)) throw new TuyaCloudError('Id de aparelho inválido.');
    const r = await this.raw<{ properties?: { code: string; value: unknown }[] }>('GET', `/v2.0/cloud/thing/${deviceId}/shadow/properties?codes=${codes.join(',')}`);
    return Object.fromEntries((r?.properties ?? []).map((p) => [p.code, p.value]));
  }

  /** Chamada GET livre (diagnóstico de serviços novos da nuvem, ex.: controle remoto infravermelho) */
  async get<T = unknown>(path: string): Promise<T> {
    if (!/^\/v[12]\.0\/[a-z0-9_\-/?=&,.]+$/i.test(path)) throw new TuyaCloudError('Caminho inválido.');
    return this.raw<T>('GET', path);
  }
}
