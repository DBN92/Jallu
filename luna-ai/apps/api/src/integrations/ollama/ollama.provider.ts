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
  /** Último motivo de indisponibilidade, em português, para mostrar ao usuário. */
  lastProblem: string | null = null;

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly timeoutMs = 90_000,
    private readonly fetchImpl: FetchLike = fetch,
    /** Mantém o modelo carregado na RAM (-1 = sempre). Recarregar custa dezenas de segundos em CPU. */
    private readonly keepAlive: string | number = -1,
  ) {}

  /** Modelos de “raciocínio” (qwen3, deepseek-r1…): desliga o pensamento longo para responder rápido. */
  private get thinkingModel() {
    return /^(qwen3|deepseek-r1|magistral|gpt-oss)/i.test(this.model);
  }

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
        this.lastProblem = ok ? null : `o modelo ${this.model} não está instalado no Ollama (rode: sudo bash scripts/ollama-setup.sh --model ${this.model}).`;
      } else this.lastProblem = `o Ollama respondeu com erro ${res.status}.`;
    } catch {
      ok = false;
      this.lastProblem = `o Ollama não está rodando em ${this.baseUrl} (veja: systemctl status ollama).`;
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

  /** Lê o NDJSON do Ollama, repassando texto (fora de blocos <think>) assim que chega. */
  private async readStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void): Promise<OllamaMessage> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let emitted = 0;
    const toolCalls: NonNullable<OllamaMessage['tool_calls']> = [];
    const emit = () => {
      // Não repassa nada que esteja dentro de <think>…</think>
      const visible = stripThinking(content.replace(/<think>[\s\S]*$/, ''));
      if (visible.length > emitted) {
        onDelta(visible.slice(emitted));
        emitted = visible.length;
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) buffer += '\n'; // processa a última linha mesmo sem quebra no final
      else buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const chunk = safeParse(line) as { message?: OllamaMessage; error?: string };
        if (chunk.error) throw new ProviderError('ollama', `Ollama: ${chunk.error}`);
        if (chunk.message?.content) {
          content += chunk.message.content;
          emit();
        }
        if (chunk.message?.tool_calls) toolCalls.push(...chunk.message.tool_calls);
      }
      if (done) break;
    }
    return { role: 'assistant', content, tool_calls: toolCalls };
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[], opts: { onDelta?: (text: string) => void; maxTokens?: number; signal?: AbortSignal } = {}): Promise<ProviderResponse> {
    const stream = Boolean(opts.onDelta);
    const body = {
      model: this.model,
      stream,
      // Contexto menor e respostas limitadas = mais rápido em CPU
      options: { temperature: 0.5, top_p: 0.9, num_ctx: 4096, num_predict: opts.maxTokens ?? 320 },
      keep_alive: this.keepAlive,
      ...(this.thinkingModel ? { think: false } : {}),
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
        signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'AbortError') throw new ProviderError('ollama', 'Cancelado.');
      this.availability = { at: Date.now(), ok: false };
      const timeout = name === 'TimeoutError';
      throw new ProviderError('ollama', timeout ? `O modelo local demorou mais de ${Math.round(this.timeoutMs / 1000)} s para responder (processador lento ou modelo grande demais).` : 'O Ollama está indisponível.');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Modelos sem suporte a tools retornam 400 "does not support tools"
      if (res.status === 400 && /does not support tools/i.test(text)) {
        throw new ProviderError('ollama', `O modelo ${this.model} não suporta ferramentas. Use, por exemplo, qwen2.5:3b ou llama3.2:3b.`, false);
      }
      throw new ProviderError('ollama', `Ollama retornou erro ${res.status}: ${text.slice(0, 160)}`);
    }
    let msg: OllamaMessage;
    if (stream && res.body) {
      msg = await this.readStream(res.body, opts.onDelta!);
    } else {
      const data = (await res.json()) as { message?: OllamaMessage };
      msg = data.message ?? { role: 'assistant', content: '' };
    }
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
