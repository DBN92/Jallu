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

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
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
