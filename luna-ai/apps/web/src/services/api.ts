export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|; )luna_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
};

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { ...opts.headers };
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken();
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, navigator.onLine ? 'Não consegui falar com o servidor da Luna.' : 'Você está sem internet.', 'offline');
  }
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'object' && data && 'message' in data ? String((data as { message: string }).message) : `Erro ${res.status}`;
    const code = typeof data === 'object' && data && 'error' in data ? String((data as { error: string }).error) : 'error';
    if (res.status === 401 && code === 'unauthenticated') unauthorizedListeners.forEach((l) => l());
    throw new ApiError(res.status, msg, code);
  }
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Algo deu errado.');

/**
 * POST com resposta em fluxo (Server-Sent Events). Chama onEvent para cada evento recebido.
 */
export async function apiStream(path: string, body: unknown, onEvent: (event: string, data: unknown) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken(), accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, navigator.onLine ? 'Não consegui falar com o servidor da Luna.' : 'Você está sem internet.', 'offline');
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (res.status === 401 && data.error === 'unauthenticated') unauthorizedListeners.forEach((l) => l());
    throw new ApiError(res.status, data.message ?? `Erro ${res.status}`, data.error ?? 'error');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}
