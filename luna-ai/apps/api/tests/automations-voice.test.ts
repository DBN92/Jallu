import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('automações', () => {
  it('cria rascunho, ativa no Home Assistant e confirma a existência real', async () => {
    ctx = await makeApp();
    const draft = await ctx.inject('POST', '/api/automations', {
      name: 'Desligar luzes às 23h',
      trigger: { type: 'time', at: '23:00' },
      action: { service: 'turn_off', target: 'all_lights' },
    });
    expect(draft.status).toBe(200);
    expect(draft.json.status).toBe('draft');
    expect(ctx.ha.automations.size).toBe(0);
    const active = await ctx.inject('POST', `/api/automations/${draft.json.id}/activate`);
    expect(active.json.status).toBe('active');
    expect(active.json.haEntityId).toMatch(/^automation\./);
    const cfg = [...ctx.ha.automations.values()][0] as { trigger: unknown[]; action: { service: string; target: { entity_id: string[] } }[] };
    expect(cfg.trigger[0]).toEqual({ platform: 'time', at: '23:00:00' });
    expect(cfg.action[0]!.service).toBe('light.turn_off');
    expect(cfg.action[0]!.target.entity_id).toContain('light.luz_da_sala');
    const disabled = await ctx.inject('POST', `/api/automations/${draft.json.id}/disable`);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'automation', service: 'turn_off' });
    expect(disabled.status).toBe(200);
    expect((await ctx.inject('DELETE', `/api/automations/${draft.json.id}`)).status).toBe(200);
    expect(ctx.ha.automations.size).toBe(0);
  });

  it('rejeita alvos não autorizados ou inexistentes', async () => {
    ctx = await makeApp();
    const r1 = await ctx.inject('POST', '/api/automations', { name: 'Aquecedor', trigger: { type: 'sunset', offsetMinutes: 0 }, action: { service: 'turn_on', target: ['switch.aquecedor'] } });
    expect(r1.status).toBe(400);
    const r2 = await ctx.inject('POST', '/api/automations', { name: 'Fake', trigger: { type: 'time', at: '10:00' }, action: { service: 'turn_on', target: ['light.nao_existe'] } });
    expect(r2.status).toBe(400);
  });

  it('a IA só cria rascunhos', async () => {
    ctx = await makeApp();
    ctx.llm.script = [
      { tool: 'create_automation_draft', args: { name: 'Varanda ao anoitecer', trigger: 'sunset', action: 'turn_on', devices: ['luz da varanda'] } },
      { content: 'Criei um rascunho. Confirme na tela Automações.' },
    ];
    const r = await chat(ctx, 'Crie uma automação para ligar a luz da varanda ao anoitecer');
    expect(r.actions[0]!.ok).toBe(true);
    const list = await ctx.inject('GET', '/api/automations');
    expect(list.json[0].status).toBe('draft');
    expect(ctx.ha.automations.size).toBe(0);
    expect(ctx.ha.calls).toHaveLength(0); // nada foi ligado imediatamente
  });
});

describe('voz', () => {
  it('provisiona sessão efêmera sem expor a chave permanente', async () => {
    ctx = await makeApp();
    const r = await ctx.inject('POST', '/api/voice/realtime/session');
    expect(r.status).toBe(200);
    expect(r.json.clientSecret).toBe('ek_test_ephemeral');
    expect(JSON.stringify(r.json)).not.toContain('sk-test-permanent-key');
    const sent = ctx.llm.requests[0] as { session: { tools: { name: string }[]; model: string } };
    expect(sent.session.tools.map((t) => t.name)).toContain('control_device');
    expect(sent.session.model).toBe('gpt-realtime');
  });

  it('executa ferramentas de voz com validação e bloqueia ferramentas desconhecidas', async () => {
    ctx = await makeApp();
    const ok = await ctx.inject('POST', '/api/voice/tools', { name: 'control_device', arguments: { device: 'luz da sala', action: 'turn_on' } });
    expect(ok.json.output.ok).toBe(true);
    expect(ctx.ha.states.get('light.luz_da_sala')!.state).toBe('on');
    const denied = await ctx.inject('POST', '/api/voice/tools', { name: 'control_device', arguments: { device: 'aquecedor', action: 'turn_on' } });
    expect(denied.json.output.ok).toBe(false);
    expect((await ctx.inject('POST', '/api/voice/tools', { name: 'call_service', arguments: {} })).status).toBe(400);
  });

  it('modo local bloqueia voz em nuvem e transcrição exige consentimento', async () => {
    ctx = await makeApp();
    await ctx.inject('PATCH', '/api/settings', { aiMode: 'local' });
    expect((await ctx.inject('POST', '/api/voice/realtime/session')).status).toBe(409);
    const t = await ctx.app.inject({ method: 'POST', url: '/api/voice/transcribe', headers: { cookie: ctx.cookies, 'x-csrf-token': ctx.csrf } });
    expect(t.statusCode).toBe(403);
  });

  it('salva transcrições no histórico', async () => {
    ctx = await makeApp();
    const a = await ctx.inject('POST', '/api/voice/transcript', { role: 'user', text: 'Que horas são?' });
    await ctx.inject('POST', '/api/voice/transcript', { role: 'assistant', text: 'São 10h.', conversationId: a.json.conversationId });
    const conv = await ctx.inject('GET', `/api/conversations/${a.json.conversationId}`);
    expect(conv.json.messages).toHaveLength(2);
    expect(conv.json.messages[0].channel).toBe('voice');
  });
});

describe('saúde', () => {
  it('health público mínimo e detalhes autenticados', async () => {
    ctx = await makeApp();
    const pub = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(pub.json()).toEqual({ status: 'ok', version: '0.1.0' });
    const det = await ctx.inject('GET', '/api/health/details');
    expect(det.json.services.homeAssistant.ok).toBe(true);
    expect(det.json.services.ollama.ok).toBe(true);
    expect(JSON.stringify(det.json)).not.toContain('test-ha-token');
  });
});
