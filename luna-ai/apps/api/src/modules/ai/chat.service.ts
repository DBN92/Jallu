import type { ActionResult, AiProviderName, AssistantState, ChatRequest, ChatResponse, DeviceDto, PublicUser, VacuumCommand } from '@luna/shared';
import type { Db } from '../../lib/db';
import { AppError, notFound } from '../../lib/errors';
import { normalize, significantTokens, truncate } from '../../lib/text';
import type { DevicesService } from '../devices/devices.service';
import type { MemoryService } from '../memory/memory.service';
import type { SettingsService } from '../settings/settings.service';
import type { WeatherService } from '../weather/weather.service';
import { parseIntent, pickOption, type Intent } from './nlu';
import { buildSystemPrompt, nowMessage } from './prompt';
import { askWhich, listJoin, powerReply, stateReply, vacuumReply, vacuumStatus, weatherReply } from './replies';
import { classify, routeProviders } from './router';
import { TOOL_DEFINITIONS, type ToolContext, type ToolExecutor } from './tools';
import { ProviderError, type AIProvider, type ChatMessage } from './types';

interface Pending {
  kind: 'power' | 'brightness' | 'query' | 'vacuum';
  action?: 'turn_on' | 'turn_off';
  vacuum?: VacuumCommand;
  value?: number;
  options: DeviceDto[];
  expires: number;
}

interface TurnResult {
  reply: string;
  provider: AiProviderName;
  model: string | null;
  actions: ActionResult[];
  notices: string[];
}

const HISTORY_LIMIT = 16;
const MAX_TOOL_ROUNDS = 5;

export class ChatService {
  private pending = new Map<string, Pending>();
  /** Aquecimento em andamento: é cancelado assim que chega uma pergunta real. */
  private warming: AbortController | null = null;
  private cameras: { findByName: (q: string) => Promise<{ entityId: string; name: string }[]> } | null = null;

  setCameras(cameras: { findByName: (q: string) => Promise<{ entityId: string; name: string }[]> }) {
    this.cameras = cameras;
  }

  private watches: { statusText: (q: string) => Promise<string> } | null = null;
  setWatches(w: { statusText: (q: string) => Promise<string> }) {
    this.watches = w;
  }

  /** Avisa as outras telas do mesmo usuário (ex.: TV) sobre a resposta, para mostrá-la lá também. */
  private replyListener: ((userId: string, reply: { userText: string; reply: string; cameraIds: string[] }) => void) | null = null;
  setReplyListener(fn: (userId: string, reply: { userText: string; reply: string; cameraIds: string[] }) => void) {
    this.replyListener = fn;
  }

  constructor(
    private readonly db: Db,
    private readonly providers: { ollama: AIProvider; openai: AIProvider },
    private readonly tools: ToolExecutor,
    private readonly devices: DevicesService,
    private readonly weather: WeatherService,
    private readonly memory: MemoryService,
    private readonly settings: SettingsService,
    private readonly timezone: string,
    private readonly onState: (userId: string, state: AssistantState, conversationId?: string) => void = () => undefined,
  ) {}

  private nowText() {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: this.timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  }

  /** onDelta (opcional): recebe o texto da resposta enquanto é gerado (streaming). */
  async handle(user: PublicUser, req: ChatRequest, onDelta?: (text: string) => void): Promise<ChatResponse> {
    const conversation = req.conversationId
      ? await this.db.conversation.findFirst({ where: { id: req.conversationId, userId: user.id } })
      : await this.db.conversation.create({ data: { userId: user.id, title: truncate(req.message, 60) } });
    if (!conversation) throw notFound('Conversa não encontrada.');

    this.warming?.abort(); // pergunta real tem prioridade sobre o aquecimento
    await this.db.message.create({ data: { conversationId: conversation.id, role: 'user', content: req.message, channel: req.channel } });
    this.onState(user.id, 'processing', conversation.id);

    let result: TurnResult;
    try {
      result = await this.turn(user, conversation.id, conversation.summary, req, onDelta);
    } catch (err) {
      this.onState(user.id, 'error', conversation.id);
      throw err;
    }

    const saved = await this.db.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: result.reply,
        provider: result.provider,
        model: result.model,
        channel: req.channel,
        meta: result.actions.length ? JSON.stringify({ actions: result.actions }) : null,
      },
    });
    await this.db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    this.onState(user.id, 'idle', conversation.id);
    const cameraIds = result.actions.filter((a) => a.tool === 'show_camera' && a.ok).flatMap((a) => a.entityIds ?? []);
    this.replyListener?.(user.id, { userText: req.message, reply: result.reply, cameraIds });
    return { conversationId: conversation.id, messageId: saved.id, ...result };
  }

  private async turn(user: PublicUser, conversationId: string, summary: string | null, req: ChatRequest, onDelta?: (text: string) => void): Promise<TurnResult> {
    const ctx: ToolContext = { userId: user.id, source: 'ai:luna-nlu', location: req.location, cloud: false };

    // 1) Resposta a uma pergunta de desambiguação pendente
    const pending = this.pending.get(conversationId);
    if (pending) {
      this.pending.delete(conversationId);
      if (pending.expires > Date.now()) {
        const picked = pickOption(req.message, pending.options);
        if (picked) return this.local(await this.applyPending(pending, picked.map((i) => pending.options[i]!), user.id, conversationId));
      }
    }

    // 2) NLU local para comandos frequentes (rápido, privado, sem LLM)
    const intent = parseIntent(req.message);
    if (intent) {
      const handled = await this.handleIntent(intent, ctx, conversationId);
      if (handled) return this.local(handled);
    }

    // 3) Modelos de linguagem com ferramentas
    return this.llm(user, conversationId, summary, req, onDelta);
  }

  private local(r: { reply: string; actions: ActionResult[] }): TurnResult {
    return { ...r, provider: 'luna-nlu', model: null, notices: [] };
  }

  private actor(userId: string) {
    return { source: 'ai:luna-nlu' as const, userId };
  }

  private async applyPending(p: Pending, chosen: DeviceDto[], userId: string, conversationId: string) {
    const actions: ActionResult[] = [];
    const replies: string[] = [];
    for (const d of chosen) {
      try {
        if (p.kind === 'query') {
          replies.push(stateReply(await this.devices.get(d.entityId)));
          continue;
        }
        this.onState(userId, 'acting', conversationId);
        if (p.kind === 'vacuum') {
          const command = p.vacuum ?? 'start';
          const after = await this.devices.vacuumCommand(d.entityId, command, this.actor(userId));
          actions.push({ tool: `vacuum_${command}`, ok: true, summary: `${after.name}: ${after.vacuum?.status ?? after.state}`, entityIds: [after.entityId] });
          replies.push(vacuumReply(command, after, d));
          continue;
        }
        const after =
          p.kind === 'brightness'
            ? await this.devices.setBrightness(d.entityId, p.value ?? 100, this.actor(userId))
            : p.action === 'turn_on'
              ? await this.devices.turnOn(d.entityId, this.actor(userId))
              : await this.devices.turnOff(d.entityId, this.actor(userId));
        actions.push({ tool: p.kind === 'brightness' ? 'set_brightness' : (p.action ?? 'turn_on'), ok: true, summary: `${after.name}: ${after.isOn ? 'ligado' : 'desligado'}`, entityIds: [after.entityId] });
        replies.push(p.kind === 'brightness' ? `${after.name} com ${after.brightness ?? p.value}% de brilho.` : powerReply(after));
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'Não consegui executar.';
        actions.push({ tool: p.action ?? p.kind, ok: false, summary: msg, entityIds: [d.entityId] });
        replies.push(msg);
      }
    }
    return { reply: replies.join(' '), actions };
  }

  /** Executa intenções determinísticas. Retorna null para deixar o LLM responder. */
  private async handleIntent(intent: Intent, ctx: ToolContext, conversationId: string): Promise<{ reply: string; actions: ActionResult[] } | null> {
    const userId = ctx.userId;
    try {
      switch (intent.type) {
        case 'datetime': {
          const now = new Date();
          const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: this.timezone, ...o }).format(now);
          return intent.what === 'time'
            ? { reply: `Agora são ${fmt({ hour: '2-digit', minute: '2-digit' })}.`, actions: [] }
            : { reply: `Hoje é ${fmt({ dateStyle: 'full' })}.`, actions: [] };
        }
        case 'weather': {
          let coords = ctx.location ?? null;
          let name: string | null = null;
          if (!coords) {
            const s = await this.settings.get(userId);
            if (s.homeLocation) {
              coords = { latitude: s.homeLocation.latitude, longitude: s.homeLocation.longitude };
              name = s.homeLocation.name;
            }
          }
          if (!coords) {
            return { reply: 'Preciso saber onde você está. Permita o acesso à localização no app ou defina a localização de casa em Configurações.', actions: [] };
          }
          const w = await this.weather.forecast(coords.latitude, coords.longitude, name);
          return { reply: weatherReply(w, intent.period, intent.umbrella), actions: [] };
        }
        case 'remember': {
          const m = await this.memory.add(userId, { type: 'fact', content: intent.content, source: 'conversation' });
          return { reply: `Combinado, vou me lembrar disso: “${m.content}”.`, actions: [{ tool: 'remember', ok: true, summary: `Memória salva: ${m.content}` }] };
        }
        case 'forget': {
          const n = await this.memory.forgetMatching(userId, intent.content);
          return {
            reply: n ? `Pronto, esqueci ${n === 1 ? 'isso' : `${n} lembranças sobre isso`}.` : 'Não encontrei nenhuma memória sobre isso.',
            actions: [{ tool: 'forget', ok: n > 0, summary: `${n} memória(s) apagada(s)` }],
          };
        }
        case 'list_on': {
          const list = (await this.devices.list()).filter((d) => d.isOn === true && (!intent.category || d.category === intent.category));
          if (!list.length) return { reply: intent.category ? 'Todas as luzes estão apagadas.' : 'Nenhum dispositivo está ligado agora.', actions: [] };
          const noun = intent.category ? (list.length === 1 ? 'Está acesa' : 'Estão acesas') : list.length === 1 ? 'Está ligado' : 'Estão ligados';
          return { reply: `${noun}: ${listJoin(list.map((d) => d.name))}.`, actions: [] };
        }
        case 'watch_status': {
          if (!this.watches) return null;
          return { reply: await this.watches.statusText(intent.query), actions: [] };
        }
        case 'show_camera': {
          if (!this.cameras) return null;
          const found = await this.cameras.findByName(intent.target);
          if (!found.length) return { reply: intent.target ? `Não encontrei uma câmera chamada “${intent.target}”.` : 'Não encontrei câmeras no Home Assistant.', actions: [] };
          if (found.length > 1 && intent.target) return { reply: `Encontrei mais de uma câmera: ${listJoin(found.map((c) => c.name))}. Qual delas?`, actions: [] };
          const cam = found[0]!;
          return {
            reply: found.length > 1 ? 'Abrindo suas câmeras.' : `Abrindo a ${/^c[aâ]mera\b/i.test(cam.name) ? cam.name.replace(/^c[aâ]mera/i, 'câmera') : `câmera ${cam.name}`}.`,
            // A tela abre o vídeo ao receber esta ação
            actions: [{ tool: 'show_camera', ok: true, summary: `Câmera: ${cam.name}`, entityIds: found.length > 1 ? found.map((c) => c.entityId) : [cam.entityId] }],
          };
        }
        case 'vacuum': {
          const vacuums = (await this.devices.list()).filter((d) => d.domain === 'vacuum');
          if (!vacuums.length) {
            return { reply: 'Ainda não encontrei nenhum aspirador robô no Home Assistant. Adicione a integração do robô no Home Assistant e ele aparece aqui.', actions: [] };
          }
          // Qual robô? Pelo nome dito; senão, deduz pelo comando
          let chosen = vacuums;
          if (significantTokens(intent.target).length) {
            const named = (await this.devices.findByName(intent.target, { domain: 'vacuum' })).map((m) => m.device);
            if (!named.length) {
              if (/\b(sala|quarto|cozinha|banheiro|escritorio|corredor|varanda|area|lavanderia|suite|closet|garagem|comodo)\b/.test(normalize(intent.target))) {
                return { reply: `Por enquanto eu ainda não consigo mandar o robô limpar só ${intent.target}. Diga “aspira a casa” para ele limpar tudo.`, actions: [] };
              }
              return { reply: `Não encontrei um aspirador chamado “${intent.target}”. Tenho: ${listJoin(vacuums.map((v) => v.name))}.`, actions: [] };
            }
            chosen = named;
          }
          if (intent.command === 'status') return { reply: chosen.map(vacuumStatus).join(' '), actions: [] };
          const command = intent.command;
          if (chosen.length > 1) {
            const active = chosen.filter((v) => ['cleaning', 'returning', 'paused'].includes(v.vacuum?.phase ?? ''));
            if (command === 'pause' || command === 'stop') {
              if (!active.length) return { reply: 'Nenhum robô está limpando agora.', actions: [] };
              chosen = active.filter((v) => v.vacuum?.phase !== 'paused');
              if (!chosen.length) return { reply: 'Os robôs já estão pausados.', actions: [] };
            } else if (command === 'return_to_base') {
              chosen = chosen.filter((v) => v.vacuum?.phase !== 'docked');
              if (!chosen.length) return { reply: 'Os robôs já estão na base.', actions: [] };
            }
            if (chosen.length > 1 && (command === 'start' || command === 'locate')) {
              this.pending.set(conversationId, { kind: 'vacuum', vacuum: command, options: chosen, expires: Date.now() + 120_000 });
              return { reply: `${command === 'start' ? 'Qual robô deve limpar' : 'Qual robô você procura'}: ${chosen.slice(0, -1).map((v) => v.name).join(', ')} ou ${chosen[chosen.length - 1]!.name}?${command === 'start' ? ' Ou os dois?' : ''}`, actions: [] };
            }
          }
          return this.applyPending({ kind: 'vacuum', vacuum: command, options: chosen, expires: 0 }, chosen, userId, conversationId);
        }
        case 'device_query': {
          const matches = await this.devices.findByName(intent.target);
          if (!matches.length) return null;
          if (matches.length > 1) {
            this.pending.set(conversationId, { kind: 'query', options: matches.map((m) => m.device), expires: Date.now() + 120_000 });
            return { reply: askWhich(matches.map((m) => m.device)), actions: [] };
          }
          return { reply: stateReply(await this.devices.get(matches[0]!.device.entityId)), actions: [] };
        }
        case 'brightness': {
          const candidates = await this.candidates(intent.target, true, 'light');
          if (candidates === null) return null;
          if (!candidates.length) return { reply: `Não encontrei uma lâmpada${intent.target ? ` chamada “${intent.target}”` : ''} com ajuste de brilho.`, actions: [] };
          if (candidates.length > 1) {
            this.pending.set(conversationId, { kind: 'brightness', value: intent.value, options: candidates, expires: Date.now() + 120_000 });
            return { reply: askWhich(candidates), actions: [] };
          }
          return this.applyPending({ kind: 'brightness', value: intent.value, options: candidates, expires: 0 }, candidates, userId, conversationId);
        }
        case 'device_power': {
          if (intent.all) {
            this.onState(userId, 'acting', conversationId);
            const res = await this.tools.execute('control_all_lights', { action: intent.action }, ctx);
            const changed = (res.output.alteradas as string[] | undefined) ?? [];
            const failed = (res.output.falhas as { nome: string; erro: string }[] | undefined) ?? [];
            if (!changed.length && !failed.length) return { reply: 'Não há luzes autorizadas para eu controlar. Autorize-as em “Minha casa”.', actions: res.action ? [res.action] : [] };
            const verb = intent.action === 'turn_on' ? 'Acendi' : 'Apaguei';
            const fail = failed.length ? ` Não consegui controlar: ${listJoin(failed.map((f) => f.nome))}.` : '';
            return { reply: `${changed.length ? `${verb} ${changed.length === 1 ? 'a luz' : `${changed.length} luzes`}: ${listJoin(changed)}.` : ''}${fail}`.trim(), actions: res.action ? [res.action] : [] };
          }
          const candidates = await this.candidates(intent.target, false, intent.lightHint ? 'light' : undefined);
          if (candidates === null) return null;
          if (!candidates.length) {
            return { reply: intent.target ? `Não encontrei um dispositivo chamado “${intent.target}”. Confira os nomes em “Minha casa”.` : 'Qual dispositivo você quer controlar?', actions: [] };
          }
          if (candidates.length > 1) {
            this.pending.set(conversationId, { kind: 'power', action: intent.action, options: candidates, expires: Date.now() + 120_000 });
            return { reply: askWhich(candidates), actions: [] };
          }
          return this.applyPending({ kind: 'power', action: intent.action, options: candidates, expires: 0 }, candidates, userId, conversationId);
        }
      }
    } catch (err) {
      if (err instanceof AppError) return { reply: err.message, actions: [] };
      throw err;
    }
    return null;
  }

  /**
   * Candidatos reais para um alvo falado. Retorna null quando o texto não parece se referir
   * a um dispositivo (ex.: "ligue para minha mãe") e o LLM deve tratar.
   */
  private async candidates(target: string, brightnessOnly: boolean, domain?: string): Promise<DeviceDto[] | null> {
    const tokens = significantTokens(target);
    if (tokens.length === 0) {
      if (!domain) return [];
      const all = (await this.devices.list()).filter((d) => d.domain === domain && d.aiAllowed && (!brightnessOnly || d.supportsBrightness));
      return all;
    }
    let matches = (await this.devices.findByName(target, { controllableOnly: true, domain })).map((m) => m.device);
    if (!matches.length && domain) matches = (await this.devices.findByName(target, { controllableOnly: true })).map((m) => m.device);
    if (!matches.length && /\b(para|pra)\b/.test(normalize(target))) return null;
    if (brightnessOnly) matches = matches.filter((d) => d.supportsBrightness);
    return matches;
  }

  private async llm(user: PublicUser, conversationId: string, summary: string | null, req: ChatRequest, onDelta?: (text: string) => void): Promise<TurnResult> {
    const settings = await this.settings.get(user.id);
    const order = routeProviders(req.message, settings.aiMode, this.providers);
    const notices: string[] = [];

    const history = await this.db.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT });
    const past: ChatMessage[] = history
      .reverse()
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }) as ChatMessage);

    for (const provider of order) {
      if (!(await provider.isAvailable())) {
        const detail = provider.name === 'ollama' ? (this.providers.ollama as { lastProblem?: string | null }).lastProblem : null;
        notices.push(provider.name === 'ollama' ? `IA local indisponível: ${detail ?? 'o Ollama não respondeu.'}` : 'A OpenAI está indisponível ou não configurada.');
        continue;
      }
      const memories = !provider.isCloud || settings.allowCloudMemory ? await this.memory.promptContext(user.id) : null;
      const system = buildSystemPrompt({ userName: user.displayName, memories, summary, cloud: provider.isCloud });
      const ctx: ToolContext = { userId: user.id, source: `ai:${provider.name}`, location: req.location, cloud: provider.isCloud };
      // Início estável (cacheável) + data/hora no fim
      const messages: ChatMessage[] = [{ role: 'system', content: system }, ...past.slice(0, -1), nowMessage(this.nowText(), req.channel === 'voice'), ...past.slice(-1)];
      const actions: ActionResult[] = [];
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          // Conversa simples no modelo local: sem a lista de ferramentas o prompt fica bem menor
          // e a resposta sai muito mais rápido em CPUs antigas.
          const lightweight = !provider.isCloud && classify(req.message) === 'simple';
          const res = await provider.chat(messages, round < MAX_TOOL_ROUNDS && !lightweight ? TOOL_DEFINITIONS : [], {
            onDelta,
            maxTokens: req.channel === 'voice' ? 200 : 380,
          });
          if (!res.toolCalls.length) {
            const reply = res.content.trim() || this.fallbackReply(actions);
            return { reply, provider: provider.name, model: provider.model, actions, notices: notices.length ? [...notices, `Respondi usando ${provider.name === 'ollama' ? 'o modelo local' : 'a OpenAI'}.`] : [] };
          }
          messages.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
          for (const call of res.toolCalls.slice(0, 6)) {
            if (/control|brightness|lights/.test(call.name)) this.onState(user.id, 'acting', conversationId);
            const outcome = await this.tools.execute(call.name, call.arguments, ctx);
            if (outcome.action) actions.push(outcome.action);
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(outcome.output) });
          }
          this.onState(user.id, 'processing', conversationId);
        }
        return { reply: this.fallbackReply(actions), provider: provider.name, model: provider.model, actions, notices };
      } catch (err) {
        // Se algo já foi executado, NÃO repete em outro provedor (evita ações duplicadas)
        if (actions.length) return { reply: this.fallbackReply(actions), provider: provider.name, model: provider.model, actions, notices: [...notices, (err as Error).message] };
        notices.push(err instanceof ProviderError ? err.message : `Falha em ${provider.name}.`);
      }
    }

    const reason = settings.aiMode === 'local' ? 'O modo “somente local” está ativo e o Ollama não respondeu.' : 'Nenhum modelo de IA respondeu agora.';
    const why = notices.length ? ` Motivo: ${notices.join(' ')}` : '';
    return {
      reply: `${reason}${why} Comandos diretos como “acenda a luz da sala”, “vai chover hoje?” ou “que horas são?” continuam funcionando.`,
      provider: 'luna-nlu',
      model: null,
      actions: [],
      notices,
    };
  }

  private fallbackReply(actions: ActionResult[]): string {
    if (!actions.length) return 'Desculpe, não consegui formular uma resposta agora.';
    return actions.map((a) => (a.ok ? `✓ ${a.summary}` : `✗ ${a.summary}`)).join('\n');
  }

  /**
   * Aquece o modelo local: carrega na RAM e pré-processa as instruções fixas (com e sem
   * ferramentas), para que a primeira pergunta real já aproveite o cache do Ollama.
   */
  async warmup(): Promise<boolean> {
    const ollama = this.providers.ollama;
    if (!(await ollama.isAvailable())) return false;
    const user = await this.db.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!user) return false;
    // UM pedido só (instruções fixas, sem ferramentas — o caso mais comum), e cancelável:
    // se o usuário perguntar algo enquanto isso, o aquecimento é abortado na hora.
    const memories = await this.memory.promptContext(user.id);
    const system = buildSystemPrompt({ userName: user.displayName, memories, summary: null, cloud: false });
    this.warming = new AbortController();
    try {
      await ollama.chat([{ role: 'system', content: system }, { role: 'user', content: 'oi' }], [], { maxTokens: 1, signal: this.warming.signal });
      return true;
    } catch {
      return this.warming.signal.aborted; // abortado por pergunta real = ok
    } finally {
      this.warming = null;
    }
  }

  /** Gera um resumo da conversa (preferindo o modelo local) e o salva como memória do tipo "summary". */
  async summarize(user: PublicUser, conversationId: string) {
    const conv = await this.db.conversation.findFirst({ where: { id: conversationId, userId: user.id }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 80 } } });
    if (!conv) throw notFound('Conversa não encontrada.');
    if (conv.messages.length < 2) throw new AppError(400, 'A conversa é curta demais para resumir.', 'too_short');
    const settings = await this.settings.get(user.id);
    const order = settings.aiMode === 'local' ? [this.providers.ollama] : [this.providers.ollama, this.providers.openai];
    const transcript = conv.messages.map((m) => `${m.role === 'user' ? 'Usuário' : 'DIA'}: ${m.content}`).join('\n');
    for (const p of order) {
      if (!(await p.isAvailable())) continue;
      if (p.isCloud && !settings.allowCloudMemory) continue;
      try {
        const res = await p.chat(
          [
            { role: 'system', content: 'Resuma a conversa em português, em até 3 frases, mantendo apenas fatos e decisões relevantes. Não invente nada.' },
            { role: 'user', content: transcript.slice(-12000) },
          ],
          [],
        );
        const text = res.content.trim();
        if (!text) continue;
        await this.db.conversation.update({ where: { id: conv.id }, data: { summary: text } });
        await this.memory.add(user.id, { type: 'summary', content: `${conv.title}: ${text}`, source: 'conversation' });
        return { summary: text, provider: p.name };
      } catch {
        continue;
      }
    }
    throw new AppError(503, 'Nenhum modelo disponível para resumir (ou o uso da nuvem para memória está desativado).', 'no_provider');
  }
}
