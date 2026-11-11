import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { voiceToolSchema } from '@luna/shared';
import { requireAuth } from '../../middleware/auth';
import { AppError } from '../../lib/errors';
import { truncate } from '../../lib/text';
import { TOOL_DEFINITIONS } from '../ai/tools';
import { buildSystemPrompt } from '../ai/prompt';

const VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];

export async function voiceRoutes(app: FastifyInstance) {
  const { voice, settings, memory, tools } = app.services;

  app.get('/api/voice/capabilities', { preHandler: requireAuth }, async () => ({
    realtime: voice.configured,
    cloudTranscription: voice.configured,
    realtimeVoices: VOICES,
  }));

  /**
   * Provisiona uma sessão efêmera para a OpenAI Realtime (WebRTC).
   * A chave permanente nunca sai do servidor; as ferramentas são definidas aqui.
   */
  app.post('/api/voice/realtime/session', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { wakeWord } = z.object({ wakeWord: z.boolean().default(false) }).parse(req.body ?? {});
    const s = await settings.get(req.user!.id);
    if (s.aiMode === 'local') throw new AppError(409, 'A voz avançada usa a nuvem. Mude o modo de IA para híbrido ou nuvem em Configurações.', 'local_only');
    const instructions = buildSystemPrompt({
      userName: req.user!.displayName,
      now: new Intl.DateTimeFormat('pt-BR', { timeZone: app.env.TZ, dateStyle: 'full', timeStyle: 'short' }).format(new Date()),
      memories: s.allowCloudMemory ? await memory.promptContext(req.user!.id) : null,
      summary: null,
      cloud: true,
      voice: true,
    });
    return voice.createRealtimeSecret({
      instructions: `${instructions}\nFale com voz calorosa e natural, em português do Brasil. Seja breve: respostas faladas de no máximo 2 ou 3 frases, a menos que o usuário peça detalhes.${wakeWord ? ' O usuário chama você dizendo "Luna"; ignore a palavra de chamada e responda ao pedido.' : ''}`,
      wakeWord,
      voice: VOICES.includes(s.realtimeVoice) ? s.realtimeVoice : 'marin',
      tools: TOOL_DEFINITIONS.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })),
    });
  });

  /** O navegador repassa chamadas de função da sessão Realtime; o backend valida e executa. */
  app.post('/api/voice/tools', { preHandler: requireAuth, config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (req) => {
    const body = voiceToolSchema.parse(req.body);
    if (!TOOL_DEFINITIONS.some((t) => t.name === body.name)) throw new AppError(400, 'Ferramenta não permitida.', 'tool_not_allowed');
    const outcome = await tools.execute(body.name, body.arguments, { userId: req.user!.id, source: 'voice', location: body.location, cloud: true });
    return outcome;
  });

  /** Guarda transcrições da voz em tempo real no histórico de conversas. */
  app.post('/api/voice/transcript', { preHandler: requireAuth }, async (req) => {
    const body = z
      .object({ conversationId: z.string().max(64).optional(), role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(4000) })
      .parse(req.body);
    let conversationId = body.conversationId;
    if (conversationId) {
      const ok = await app.db.conversation.findFirst({ where: { id: conversationId, userId: req.user!.id } });
      if (!ok) conversationId = undefined;
    }
    if (!conversationId) {
      conversationId = (await app.db.conversation.create({ data: { userId: req.user!.id, title: `🎙️ ${truncate(body.text, 55)}` } })).id;
    }
    await app.db.message.create({ data: { conversationId, role: body.role, content: body.text, channel: 'voice', provider: body.role === 'assistant' ? 'openai-realtime' : null } });
    await app.db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return { conversationId };
  });

  /** Transcrição em nuvem (alternativa quando o navegador não oferece reconhecimento de fala). */
  app.post('/api/voice/transcribe', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const s = await settings.get(req.user!.id);
    if (!s.allowCloudTranscription) throw new AppError(403, 'Ative “Permitir transcrição na nuvem” em Configurações para usar este recurso.', 'cloud_transcription_disabled');
    const file = await req.file();
    if (!file) throw new AppError(400, 'Nenhum áudio enviado.', 'no_audio');
    const buf = await file.toBuffer();
    if (buf.length < 1000) throw new AppError(400, 'Áudio muito curto.', 'audio_short');
    const text = await voice.transcribe(buf, file.mimetype || 'audio/webm', file.filename || 'audio.webm');
    return { text };
  });
}
