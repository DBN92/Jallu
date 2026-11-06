import { AppError, ServiceUnavailableError } from '../../lib/errors';

type FetchLike = typeof fetch;

/**
 * Operações de voz na OpenAI. A chave permanente fica no servidor; o navegador recebe
 * apenas um client secret efêmero (expira em minutos) para abrir a sessão WebRTC.
 * Docs: https://platform.openai.com/docs/guides/realtime-webrtc
 */
export class OpenAIVoiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly realtimeModel: string,
    private readonly transcribeModel: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  get configured() {
    return Boolean(this.apiKey);
  }

  async createRealtimeSecret(session: { instructions: string; voice: string; tools: unknown[]; wakeWord?: boolean }) {
    if (!this.configured) throw new ServiceUnavailableError('openai', 'Configure OPENAI_API_KEY no servidor para usar a voz avançada.');
    const res = await this.fetchImpl(`${this.baseUrl}/realtime/client_secrets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: {
          type: 'realtime',
          model: this.realtimeModel,
          instructions: session.instructions,
          audio: {
            input: {
              // O prompt ajuda a transcrição a reconhecer o nome "DIA"
              transcription: { model: this.transcribeModel, language: 'pt', prompt: 'Oi, Dia. Oi, Dia, acenda a luz da sala.' },
              // Detecção por silêncio (mais rápida que semantic_vad). No modo "Oi, Dia" o navegador
              // decide quando responder (create_response: false).
              turn_detection: {
                type: 'server_vad',
                threshold: 0.55,
                prefix_padding_ms: 300,
                silence_duration_ms: 550,
                create_response: !session.wakeWord,
                interrupt_response: true,
              },
            },
            output: { voice: session.voice },
          },
          tools: session.tools,
          tool_choice: 'auto',
        },
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new ServiceUnavailableError('openai', 'Sem conexão com a OpenAI para iniciar a voz em tempo real.');
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AppError(502, `A OpenAI recusou a sessão de voz (${res.status}). ${text.slice(0, 200)}`, 'realtime_error');
    }
    const data = (await res.json()) as { value: string; expires_at: number };
    return { clientSecret: data.value, expiresAt: data.expires_at, model: this.realtimeModel };
  }

  async transcribe(audio: Buffer, mimeType: string, filename: string): Promise<string> {
    if (!this.configured) throw new ServiceUnavailableError('openai', 'Transcrição em nuvem indisponível: OPENAI_API_KEY não configurada.');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
    form.append('model', this.transcribeModel);
    form.append('language', 'pt');
    const res = await this.fetchImpl(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {
      throw new ServiceUnavailableError('openai', 'Sem conexão com a OpenAI para transcrever o áudio.');
    });
    if (!res.ok) throw new AppError(502, `Falha na transcrição (${res.status}).`, 'transcribe_error');
    const data = (await res.json()) as { text: string };
    return data.text.trim();
  }
}
