import type { AIProvider, ChatMessage, ProviderResponse, ToolDefinition } from '../../modules/ai/types';
import { ProviderError } from '../../modules/ai/types';

type FetchLike = typeof fetch;

/** Provedor de nuvem via API oficial da OpenAI (Chat Completions com function calling). */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  readonly isCloud = true;
  private availability: { at: number; ok: boolean } | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs = 60_000,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async isAvailable(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    // Falhas recentes marcam indisponibilidade por 60 s, evitando esperas repetidas.
    if (this.availability && !this.availability.ok && Date.now() - this.availability.at < 60_000) return false;
    return true;
  }

  async status(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) return { ok: false, detail: 'OPENAI_API_KEY não configurada' };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/models/${encodeURIComponent(this.model)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 401) return { ok: false, detail: 'Chave da OpenAI inválida' };
      if (res.status === 404) return { ok: false, detail: `Modelo ${this.model} não disponível na sua conta` };
      return { ok: res.ok, detail: res.ok ? `Modelo ${this.model} disponível` : `OpenAI respondeu ${res.status}` };
    } catch {
      return { ok: false, detail: 'Sem conexão com a OpenAI' };
    }
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[], opts: { onDelta?: (text: string) => void; maxTokens?: number; signal?: AbortSignal } = {}): Promise<ProviderResponse> {
    void opts; // sem streaming aqui: a resposta completa é enviada ao final
    if (!this.isConfigured()) throw new ProviderError('openai', 'A OpenAI não está configurada.', false);
    const body = {
      model: this.model,
      temperature: 0.4,
      messages: messages.map((m) => {
        if (m.role === 'assistant') {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls?.length
              ? m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } }))
              : undefined,
          };
        }
        if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
        return { role: m.role, content: m.content };
      }),
      tools: tools.length ? tools.map((t) => ({ type: 'function', function: t })) : undefined,
    };

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      this.availability = { at: Date.now(), ok: false };
      throw new ProviderError('openai', 'Sem conexão com a OpenAI.');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status >= 500 || res.status === 429) this.availability = { at: Date.now(), ok: false };
      const reason = res.status === 401 ? 'chave inválida' : res.status === 429 ? 'limite de uso/créditos atingido' : `erro ${res.status}`;
      throw new ProviderError('openai', `A OpenAI recusou a requisição (${reason}). ${text.slice(0, 120)}`.trim(), res.status !== 401);
    }
    this.availability = { at: Date.now(), ok: true };
    const data = (await res.json()) as {
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    };
    const msg = data.choices[0]?.message;
    return {
      content: msg?.content ?? '',
      toolCalls: (msg?.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, arguments: parseArgs(c.function.arguments) })),
    };
  }
}

function parseArgs(v: string): Record<string, unknown> {
  try {
    return JSON.parse(v) as Record<string, unknown>;
  } catch {
    return {};
  }
}
