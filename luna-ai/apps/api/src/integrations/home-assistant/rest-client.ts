import { ServiceUnavailableError, AppError } from '../../lib/errors';
import type { HaState } from './types';

export type FetchLike = typeof fetch;

/**
 * Cliente REST do Home Assistant. Usa token de longa duração mantido SOMENTE no backend.
 * Documentação: https://developers.home-assistant.io/docs/api/rest
 */
export class HomeAssistantRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  get configured(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableError('home_assistant', 'O Home Assistant não está configurado (HA_URL/HA_TOKEN no .env).');
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableError('home_assistant', 'Não consegui falar com o Home Assistant. Ele está ligado e acessível?');
    }
    if (res.status === 401) throw new ServiceUnavailableError('home_assistant', 'O token do Home Assistant é inválido ou expirou.');
    if (res.status === 404) throw new AppError(404, 'Entidade ou recurso não encontrado no Home Assistant.', 'ha_not_found');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AppError(502, `O Home Assistant retornou erro ${res.status}. ${text.slice(0, 200)}`.trim(), 'ha_error');
    }
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('json') ? await res.json() : await res.text()) as T;
  }

  async ping(): Promise<boolean> {
    const r = await this.request<{ message?: string }>('GET', '/api/');
    return typeof r === 'object' && r !== null;
  }

  getStates(): Promise<HaState[]> {
    return this.request<HaState[]>('GET', '/api/states');
  }

  getState(entityId: string): Promise<HaState> {
    return this.request<HaState>('GET', `/api/states/${encodeURIComponent(entityId)}`);
  }

  callService(domain: string, service: string, data: Record<string, unknown>): Promise<HaState[]> {
    return this.request<HaState[]>('POST', `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, data);
  }

  /** API de configuração de automações (a mesma usada pelo editor do HA). Requer usuário administrador no token. */
  saveAutomationConfig(id: string, config: Record<string, unknown>) {
    return this.request<{ result: string }>('POST', `/api/config/automation/config/${encodeURIComponent(id)}`, config);
  }

  deleteAutomationConfig(id: string) {
    return this.request<{ result: string }>('DELETE', `/api/config/automation/config/${encodeURIComponent(id)}`);
  }

  getAutomationConfig(id: string) {
    return this.request<Record<string, unknown>>('GET', `/api/config/automation/config/${encodeURIComponent(id)}`);
  }
}
