import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';
import { answerPersonal, parsePersonal } from '../src/modules/ai/personal';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

describe('perguntas sobre a própria família (pelas memórias, sem IA)', () => {
  it('entende as formas comuns de perguntar', () => {
    for (const t of ['qual o nome da minha esposa', 'Qual é o nome da minha esposa?', 'qual nome da minha esposa', 'como se chama minha esposa', 'como chama a minha esposa', 'quem é minha esposa']) {
      expect(parsePersonal(t)?.relation, t).toBe('esposa');
    }
    expect(parsePersonal('qual o nome do meu filho')).toMatchObject({ relation: 'filho', feminine: false, name: true });
    expect(parsePersonal('o que você sabe sobre minha mãe')).toMatchObject({ relation: 'mae', name: false });
    expect(parsePersonal('qual o nome da música que está tocando')).toBeNull();
    expect(parsePersonal('acende a luz da sala')).toBeNull();
  });

  it('acha o nome em memórias escritas de jeitos diferentes', () => {
    const q = parsePersonal('qual o nome da minha esposa')!;
    expect(answerPersonal(q, [{ content: 'minha esposa se chama Natália' }])).toBe('Sua esposa se chama Natália.');
    expect(answerPersonal(q, [{ content: 'A esposa do Daniel é a Natália' }])).toBe('Sua esposa se chama Natália.');
    expect(answerPersonal(q, [{ content: 'Natália é minha mulher' }])).toBe('Sua esposa se chama Natália.');
    expect(answerPersonal(q, [{ content: 'gosto de café sem açúcar' }])).toMatch(/^Ainda não sei\. .*lembre que minha esposa se chama/);
    expect(answerPersonal(parsePersonal('qual o nome do meu filho')!, [{ content: 'meu filho se chama Pedro Henrique' }])).toBe('Seu filho se chama Pedro Henrique.');
  });

  it('por voz, de ponta a ponta: aprende e responde na hora', async () => {
    ctx = await makeApp();
    expect((await chat(ctx, 'Oi Luna, qual o nome da minha esposa?')).reply).toMatch(/^Ainda não sei/);
    await chat(ctx, 'Luna, lembre que minha esposa se chama Natália');
    const r = await chat(ctx, 'Oi Luna, qual o nome da minha esposa?');
    expect(r.reply).toBe('Sua esposa se chama Natália.');
    expect(r.provider ?? 'local').not.toBe('openai');
  });
});
