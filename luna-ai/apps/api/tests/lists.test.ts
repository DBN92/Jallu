import { afterEach, describe, expect, it } from 'vitest';
import { parseIntent } from '../src/modules/ai/nlu';
import { splitItems } from '../src/modules/lists/lists.service';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());
const say = async (message: string) => (await ctx.inject('POST', '/api/chat', { message })).json.reply as string;

describe('Lista da casa e notas', () => {
  it('entende os pedidos por voz', () => {
    expect(parseIntent('Oi Luna, põe leite, pão e ovos na lista de compras')).toEqual({ type: 'lists', command: 'buy', text: 'leite, pão e ovos' });
    expect(parseIntent('coloca café na lista')).toMatchObject({ command: 'buy', text: 'café' });
    expect(parseIntent('acabou o açúcar')).toMatchObject({ command: 'buy', text: 'açúcar' });
    expect(parseIntent('preciso comprar papel higiênico')).toMatchObject({ command: 'buy', text: 'papel higiênico' });
    expect(parseIntent('comprei o leite e o pão')).toMatchObject({ command: 'bought', text: 'o leite e o pão' });
    expect(parseIntent('o que falta comprar?')).toMatchObject({ command: 'list_buy' });
    expect(parseIntent('lê a lista de compras')).toMatchObject({ command: 'list_buy' });
    expect(parseIntent('tem arroz em casa?')).toMatchObject({ command: 'has', text: 'arroz' });
    expect(parseIntent('cria uma nota: pagar a conta de luz dia 10')).toMatchObject({ command: 'note', text: 'pagar a conta de luz dia 10' });
    expect(parseIntent('lê minhas notas')).toMatchObject({ command: 'list_notes' });
    // não confunde com outros comandos
    expect(parseIntent('quanto falta para a máquina terminar?')?.type).toBe('washer');
    expect(parseIntent('acabou a luz')?.type).not.toBe('lists');
    expect(parseIntent('tem alguma luz acesa em casa?')?.type).not.toBe('lists');
    expect(splitItems('o leite, mais pão e 2 pacotes de café')).toEqual(['Leite', 'Pão', '2 pacotes de café']);
  });

  it('itens: comprar, comprado, acabou; notas; tudo pela voz e pela tela', async () => {
    ctx = await makeApp();
    expect(await say('põe leite, pão e ovos na lista de compras')).toBe('Coloquei leite, pão e ovos na lista de compras.');
    expect(await say('o que falta comprar?')).toBe('Falta comprar 3 itens: leite, ovos e pão.');
    expect(await say('comprei o leite')).toMatch(/^Anotei que tem leite em casa\. Ainda faltam 2 itens/);
    expect(await say('tem leite em casa?')).toBe('Tem leite em casa.');
    expect(await say('acabou o leite')).toBe('Coloquei leite na lista de compras.');
    expect(await say('tem leite em casa?')).toBe('Leite está na lista de compras: acabou.');
    // mesmo item com outra grafia não duplica
    const it1 = (await ctx.inject('POST', '/api/lists/items', { name: 'LEITE', status: 'have', quantity: '2 caixas' })).json;
    expect(it1).toMatchObject({ name: 'Leite', status: 'have', quantity: '2 caixas' });
    const items = (await ctx.inject('GET', '/api/lists/items')).json as { name: string }[];
    expect(items.map((i) => i.name)).toEqual(['Leite', 'Ovos', 'Pão']);
    expect((await ctx.inject('POST', '/api/lists/items/bought-all')).json).toEqual({ count: 2 });
    expect(await say('o que falta comprar?')).toBe('A lista de compras está vazia.');
    expect((await ctx.inject('PATCH', `/api/lists/items/${it1.id}`, { name: 'Ovos' })).status).toBe(400);
    expect((await ctx.inject('DELETE', `/api/lists/items/${it1.id}`)).json).toEqual({ ok: true });

    expect(await say('cria uma nota: pagar a conta de luz dia 10')).toBe('Nota criada: “Pagar a conta de luz dia 10”.');
    const [n] = (await ctx.inject('GET', '/api/lists/notes')).json as { id: string }[];
    expect((await ctx.inject('PATCH', `/api/lists/notes/${n!.id}`, { pinned: true })).json).toMatchObject({ pinned: true });
    expect(await say('lê minhas notas')).toBe('Você tem uma nota. 1: Pagar a conta de luz dia 10.');
    expect((await ctx.inject('DELETE', `/api/lists/notes/${n!.id}`)).json).toEqual({ ok: true });
  });
});
