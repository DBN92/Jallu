import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onUnauthorized } from './api';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('cliente da API', () => {
  it('envia o token CSRF do cookie em requisições que alteram estado', async () => {
    document.cookie = 'luna_csrf=abc123';
    const f = reply(200, { ok: true });
    vi.stubGlobal('fetch', f);
    await api('/api/devices/light.x/turn-on', { method: 'POST' });
    const init = f.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('abc123');
    expect(init.credentials).toBe('same-origin');
  });

  it('não envia CSRF em GET', async () => {
    const f = reply(200, []);
    vi.stubGlobal('fetch', f);
    await api('/api/devices');
    expect((f.mock.calls[0]![1] as RequestInit).headers).toEqual({});
  });

  it('converte erros do servidor em mensagens legíveis', async () => {
    vi.stubGlobal('fetch', reply(503, { error: 'home_assistant_unavailable', message: 'O Home Assistant está offline.' }));
    await expect(api('/api/devices')).rejects.toMatchObject({ status: 503, message: 'O Home Assistant está offline.' });
  });

  it('avisa quando não há conexão', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = (await api('/api/devices').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('offline');
  });

  it('dispara o evento de sessão expirada em 401', async () => {
    vi.stubGlobal('fetch', reply(401, { error: 'unauthenticated', message: 'Sua sessão expirou.' }));
    const spy = vi.fn();
    const off = onUnauthorized(spy);
    await api('/api/devices').catch(() => undefined);
    off();
    expect(spy).toHaveBeenCalledOnce();
  });
});
