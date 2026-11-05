export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string; name: string };

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema dos parâmetros */
  parameters: Record<string, unknown>;
}

export interface ProviderResponse {
  content: string;
  toolCalls: ToolCall[];
}

/** Interface independente de fornecedor. Novos provedores só precisam implementá-la. */
export interface AIProvider {
  readonly name: 'ollama' | 'openai';
  readonly model: string;
  /** true quando o provedor é executado fora da casa (dados saem da rede local). */
  readonly isCloud: boolean;
  isConfigured(): boolean;
  isAvailable(): Promise<boolean>;
  /**
   * onDelta (opcional): recebe pedaços do texto conforme são gerados (streaming).
   * Provedores sem streaming simplesmente não chamam onDelta.
   */
  chat(messages: ChatMessage[], tools: ToolDefinition[], opts?: { onDelta?: (text: string) => void; maxTokens?: number }): Promise<ProviderResponse>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
  }
}
