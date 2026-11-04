import type { AIProvider, ChatMessage, ProviderResponse, ToolDefinition } from '../../modules/ai/types';
import { ProviderError } from '../../modules/ai/types';

type FetchLike = typeof fetch;

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
  tool_name?: string;
}

/** Provedor de IA local via API HTTP do Ollama (https://github.com/ollama/ollama/blob/main/docs/api.md). */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama' as const;
  readonly isCloud = false;
  private availability: { at: number; ok: boolean } | null = null;

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly timeoutMs = 90_000,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured() {
    return Boolean(this.baseUrl && this.model);
  }

  /** Verifica se o servidor responde e se o modelo configurado está instalado (cache de 30 s). */
  async isAvailable(): Promise<boolean> {
    if (this.availability && Date.now() - this.availability.at < 30_000) return this.availability.ok;
    let ok = false;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as { models?: { name: string; model?: string }[] };
        const wanted = this.model.includes(':') ? this.model : `${this.model}:latest`;
        ok = (data.models ?? []).some((m) => m.name === wanted || m.model === wanted || m.name === this.model);
      }
    } catch {
      ok = false;
    }
    this.availability = { at: Date.now(), ok };
    return ok;
  }

  async status(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { ok: false, detail: `Ollama respondeu ${res.status}` };
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      const wanted = this.model.includes(':') ? this.model : `${this.model}:latest`;
      if (!names.includes(wanted) && !names.includes(this.model)) {
        return { ok: false, detail: `Modelo ${this.model} não instalado. Execute: ollama pull ${this.model}` };
      }
      return { ok: true, detail: `Modelo ${this.model} pronto` };
    } catch {
      return { ok: false, detail: `Ollama inacessível em ${this.baseUrl}` };
    }
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ProviderResponse> {
    const body = {
      model: this.model,
      stream: false,
      options: { temperature: 0.3, num_ctx: 8192 },
      keep_alive: '30m',
      messages: messages.map<OllamaMessage>((m) => {
        if (m.role === 'assistant') {
          return {
            role: 'assistant',
            content: m.content,
            tool_calls: m.toolCalls?.map((c) => ({ function: { name: c.name, arguments: c.arguments } })),
          };
        }
        if (m.role === 'tool') return { role: 'tool', content: m.content, tool_name: m.name };
        return { role: m.role, content: m.content };
      }),
      tools: tools.length ? tools.map((t) => ({ type: 'function', function: t })) : undefined,
    };

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.availability = { at: Date.now(), ok: false };
      const timeout = (err as Error).name === 'TimeoutError';
      throw new ProviderError('ollama', timeout ? 'O modelo local demorou demais para responder.' : 'O Ollama está indisponível.');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Modelos sem suporte a tools retornam 400 "does not support tools"
      if (res.status === 400 && /does not support tools/i.test(text)) {
        throw new ProviderError('ollama', `O modelo ${this.model} não suporta ferramentas. Use, por exemplo, qwen2.5:3b ou llama3.2:3b.`, false);
      }
      throw new ProviderError('ollama', `Ollama retornou erro ${res.status}: ${text.slice(0, 160)}`);
    }
    const data = (await res.json()) as { message?: OllamaMessage };
    const msg = data.message ?? { role: 'assistant', content: '' };
    return {
      content: stripThinking(msg.content ?? ''),
      toolCalls: (msg.tool_calls ?? []).map((c, i) => ({
        id: `ollama_${Date.now()}_${i}`,
        name: c.function.name,
        arguments: typeof c.function.arguments === 'string' ? safeParse(c.function.arguments) : (c.function.arguments ?? {}),
      })),
    };
  }
}

function safeParse(v: string): Record<string, unknown> {
  try {
    return JSON.parse(v) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Remove blocos <think>…</think> de modelos de raciocínio (ex.: qwen3). */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
