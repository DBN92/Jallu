import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('conversa e controle da casa', () => {
  it('“Luna, acenda a luz da sala” liga a lâmpada real e confirma', async () => {
    ctx = await makeApp();
    const r = await chat(ctx, 'Luna, acenda a luz da sala.');
    expect(r.provider).toBe('luna-nlu');
    expect(r.reply).toBe('Pronto! A luz da Sala está acesa.');
    expect(ctx.ha.states.get('light.luz_da_sala')!.state).toBe('on');
    expect(r.actions[0]).toMatchObject({ ok: true });
  });

  it('pergunta qual dispositivo quando há ambiguidade e executa após a resposta', async () => {
    ctx = await makeApp();
    const r1 = await chat(ctx, 'acenda a luz do quarto');
    expect(r1.reply).toMatch(/mais de um/);
    expect(r1.reply).toMatch(/Casal/);
    expect(ctx.ha.calls).toHaveLength(0);
    const r2 = await chat(ctx, 'a do casal', { conversationId: r1.conversationId });
    expect(r2.reply).toMatch(/acesa/);
    expect(ctx.ha.states.get('light.luz_do_quarto_casal')!.state).toBe('on');
    expect(ctx.ha.states.get('light.luz_do_quarto_hospedes')!.state).toBe('on'); // já estava
  });

  it('“apague todas as luzes” afeta apenas luzes autorizadas', async () => {
    ctx = await makeApp();
    await ctx.inject('PATCH', '/api/devices/light.luz_da_varanda', { aiAllowed: false });
    ctx.ha.states.get('light.luz_da_varanda')!.state = 'on';
    await chat(ctx, 'Luna, apague todas as luzes');
    expect(ctx.ha.states.get('light.luz_do_quarto_hospedes')!.state).toBe('off');
    expect(ctx.ha.states.get('light.luz_da_varanda')!.state).toBe('on');
    expect(ctx.ha.calls.every((c) => c.domain === 'light')).toBe(true);
  });

  it('recusa controlar dispositivos não autorizados para a IA', async () => {
    ctx = await makeApp();
    const r = await chat(ctx, 'ligue o aquecedor');
    expect(r.reply).toMatch(/não está autorizado/);
    expect(ctx.ha.states.get('switch.aquecedor')!.state).toBe('off');
  });

  it('consulta estado e lista luzes acesas', async () => {
    ctx = await makeApp();
    expect((await chat(ctx, 'quais luzes estão acesas?')).reply).toBe('Está acesa: Luz do Quarto Hóspedes.');
    expect((await chat(ctx, 'a luz da sala está acesa?')).reply).toBe('Luz da Sala está apagada.');
    expect((await chat(ctx, 'coloque a luz da sala em 30%')).reply).toMatch(/30%/);
  });

  it('usa o Ollama com ferramentas para pedidos livres', async () => {
    ctx = await makeApp();
    ctx.llm.script = [{ tool: 'list_devices', args: { category: 'lighting', only_on: true } }, { content: 'Só a luz do quarto de hóspedes está acesa.' }];
    const r = await chat(ctx, 'me fala o status da iluminação da casa');
    expect(r.provider).toBe('ollama');
    expect(r.reply).toMatch(/hóspedes/);
    const second = ctx.llm.requests[1] as { messages: { role: string; content: string }[] };
    expect(second.messages.at(-1)!.role).toBe('tool');
    expect(second.messages.at(-1)!.content).toContain('light.luz_do_quarto_hospedes');
  });

  it('conversa simples no modelo local não envia a lista de ferramentas (mais rápido)', async () => {
    ctx = await makeApp();
    ctx.llm.script = [{ content: 'Claro! Por que o livro de matemática ficou triste? Porque tinha muitos problemas.' }];
    const r = await chat(ctx, 'conte uma piada');
    expect(r.provider).toBe('ollama');
    expect((ctx.llm.requests[0] as { tools?: unknown[] }).tools).toBeUndefined();
  });

  it('não executa nada se o modelo tentar uma ferramenta inexistente', async () => {
    ctx = await makeApp();
    ctx.llm.script = [{ tool: 'run_shell', args: { cmd: 'rm -rf /' } }, { content: 'Não posso fazer isso.' }];
    const r = await chat(ctx, 'execute um comando no servidor');
    expect(ctx.ha.calls).toHaveLength(0);
    const second = ctx.llm.requests[1] as { messages: { content: string }[] };
    expect(second.messages.at(-1)!.content).toContain('Ferramenta desconhecida');
    expect(r.reply).toBe('Não posso fazer isso.');
  });

  it('roteia tarefas complexas para a OpenAI no modo híbrido', async () => {
    ctx = await makeApp();
    ctx.llm.script = [{ content: 'Vamos organizar sua semana!' }];
    const r = await chat(ctx, 'Me ajude a organizar minha semana');
    expect(r.provider).toBe('openai');
    // Memórias não são enviadas à nuvem por padrão
    const req = ctx.llm.requests[0] as { messages: { role: string; content: string }[] };
    expect(req.messages[0]!.content).toMatch(/não compartilhadas/);
  });

  it('modo somente local nunca usa a nuvem e informa indisponibilidade', async () => {
    ctx = await makeApp();
    await ctx.inject('PATCH', '/api/settings', { aiMode: 'local' });
    ctx.llm.available = false;
    const r = await chat(ctx, 'Me ajude a organizar minha semana');
    expect(r.provider).toBe('luna-nlu');
    expect(r.reply).toMatch(/somente local/);
    // Comandos diretos continuam funcionando sem LLM
    const r2 = await chat(ctx, 'acenda a luz da sala');
    expect(r2.reply).toMatch(/acesa/);
  });

  it('usa a OpenAI quando o Ollama falha no modo híbrido', async () => {
    ctx = await makeApp({ OLLAMA_MODEL: 'modelo-nao-instalado' });
    ctx.llm.script = [{ content: 'Oi! Estou aqui.' }];
    const r = await chat(ctx, 'oi, tudo bem com você?');
    expect(r.provider).toBe('openai');
    expect(r.notices.join(' ')).toMatch(/Ollama/);
  });

  it('salva e recupera conversas', async () => {
    ctx = await makeApp();
    const r = await chat(ctx, 'que horas são?');
    expect(r.reply).toMatch(/^Agora são \d{2}:\d{2}\.$/);
    const list = await ctx.inject('GET', '/api/conversations');
    expect(list.json[0].messageCount).toBe(2);
    const conv = await ctx.inject('GET', `/api/conversations/${r.conversationId}`);
    expect(conv.json.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect((await ctx.inject('DELETE', `/api/conversations/${r.conversationId}`)).status).toBe(200);
  });

  it('erro compreensível quando o Home Assistant está offline', async () => {
    ctx = await makeApp();
    ctx.ha.online = false;
    const r = await chat(ctx, 'acenda a luz da sala');
    expect(r.reply).toMatch(/Home Assistant/);
  });
});

describe('Modo híbrido não fica esperando o modelo local', () => {
  it('se o modelo local não começa a responder a tempo, responde pela OpenAI', async () => {
    const ctx = await makeApp({ LUNA_HYBRID_LOCAL_TIMEOUT_MS: '3000' });
    try {
      await ctx.inject('PATCH', '/api/settings', { aiMode: 'hybrid' });
      ctx.llm.ollamaDelayMs = 60_000;
      ctx.llm.script = [{ content: 'Resposta da nuvem.' }];
      const t0 = Date.now();
      const r = await ctx.inject('POST', '/api/chat', { message: 'me conta uma curiosidade' });
      expect(r.json.reply).toBe('Resposta da nuvem.');
      expect(r.json.provider).toBe('openai');
      expect(r.json.notices.join(' ')).toMatch(/demorou mais de 3 s; usei a OpenAI/);
      expect(Date.now() - t0).toBeLessThan(8000);
    } finally {
      await ctx.app.close();
    }
  }, 15_000);
});

describe('Voz em tempo real: comandos da casa', () => {
  it('luna_comando abre câmera e usa as listas; pedido comum volta para o modelo', async () => {
    const ctx = await makeApp();
    try {
      ctx.ha.states.set('camera.quintal', { entity_id: 'camera.quintal', state: 'idle', attributes: { friendly_name: 'Quintal' }, last_changed: new Date().toISOString() });
      const tool = (pedido: string) => ctx.inject('POST', '/api/voice/tools', { name: 'luna_comando', arguments: { pedido } });
      const cam = (await tool('abre a câmera do quintal')).json;
      expect(cam).toMatchObject({ output: { ok: true, resposta: expect.stringMatching(/câmera Quintal/) }, ui: { cameraIds: ['camera.quintal'] } });
      expect((await tool('põe leite na lista de compras')).json.output.resposta).toBe('Coloquei leite na lista de compras.');
      expect((await tool('deixa um recado')).json.ui.open).toBe('recorder');
      expect((await tool('quem descobriu o Brasil?')).json.output.ok).toBe(false);
    } finally {
      await ctx.app.close();
    }
  });
});
