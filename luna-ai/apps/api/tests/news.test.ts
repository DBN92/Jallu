import { afterEach, describe, expect, it } from 'vitest';
import { parseFeed } from '../src/modules/news/news.service';
import { makeApp, type TestCtx } from './helpers';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const rss = (items: string) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>x</title>${items}</channel></rss>`;
const item = (title: string, link: string, date: string, extra = '') => `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate>${extra}</item>`;

describe('Notícias', () => {
  it('lê RSS: CDATA, entidades, HTML no resumo, imagem e data', () => {
    const [a] = parseFeed(
      rss(item('Chuva forte em SP &amp; alerta', 'https://g1.globo.com/sp/a.html', 'Fri, 27 Nov 2026 01:00:00 +0000', '<description>&lt;p&gt;Defesa Civil &lt;b&gt;alerta&lt;/b&gt;&lt;/p&gt;</description><media:content url="https://s2.glbimg.com/foto.jpg" medium="image"/>')),
    );
    expect(a).toEqual({ title: 'Chuva forte em SP & alerta', link: 'https://g1.globo.com/sp/a.html', summary: 'Defesa Civil alerta', at: '2026-11-27T01:00:00.000Z', image: 'https://s2.glbimg.com/foto.jpg' });
  });

  it('junta os jornais escolhidos, filtra o feed geral da CNN por assunto, decodifica ISO-8859-1 e salva a escolha', async () => {
    const latin1 = Buffer.from(rss(item('Ônibus param em São Paulo', 'https://www1.folha.uol.com.br/cotidiano/x.shtml', 'Fri, 27 Nov 2026 02:00:00 -0300')).replace('UTF-8', 'ISO-8859-1'), 'latin1');
    const feeds: Record<string, string | Buffer> = {
      'https://g1.globo.com/rss/g1/sp/sao-paulo/': rss(item('Trânsito na Marginal', 'https://g1.globo.com/sp/1.ghtml', 'Fri, 27 Nov 2026 03:00:00 +0000')),
      'https://g1.globo.com/rss/g1/tecnologia/': rss(item('Novo celular', 'https://g1.globo.com/tec/1.ghtml', 'Fri, 27 Nov 2026 03:10:00 +0000')),
      'https://www.cnnbrasil.com.br/rss/': rss(
        item('Eleição na Argentina', 'https://www.cnnbrasil.com.br/internacional/a/', 'Fri, 27 Nov 2026 01:00:00 +0000') +
          item('Lançamento de IA', 'https://www.cnnbrasil.com.br/tecnologia/b/', 'Fri, 27 Nov 2026 01:05:00 +0000') +
          item('Juros sobem', 'https://www.cnnbrasil.com.br/economia/c/', 'Fri, 27 Nov 2026 01:06:00 +0000'),
      ),
      'https://feeds.folha.uol.com.br/cotidiano/rss091.xml': latin1,
    };
    const asked: string[] = [];
    ctx = await makeApp({}, { login: true, newsFetch: (async (url: string) => (asked.push(String(url)), feeds[String(url)] ? new Response(feeds[String(url)] as unknown as ConstructorParameters<typeof Response>[0]) : new Response('x', { status: 500 }))) as unknown as typeof fetch });
    const r = (await ctx.inject('GET', '/api/news')).json;
    expect(r.config).toEqual({ sources: ['g1', 'cnn', 'folha'], topics: ['sp', 'mundo', 'tec'] });
    const titles = (t: string) => r.items.filter((i: { topic: string }) => i.topic === t).map((i: { title: string }) => i.title);
    expect(titles('sp')).toEqual(['Ônibus param em São Paulo', 'Trânsito na Marginal']); // 02:00 de Brasília = 05:00 UTC, a mais nova
    expect(titles('mundo')).toEqual(['Eleição na Argentina']);
    expect(titles('tec')).toEqual(['Novo celular', 'Lançamento de IA']);
    expect(r.items.some((i: { title: string }) => i.title === 'Juros sobem')).toBe(false);
    expect(r.failed).toContain('Folha'); // mundo e tec da Folha não responderam
    expect(asked.filter((u) => u.includes('cnnbrasil')).length).toBe(1); // o feed geral da CNN serve os 3 assuntos com uma busca só

    const saved = (await ctx.inject('PUT', '/api/news/config', { sources: ['tecmundo', 'inventado'], topics: ['tec', 'tec'] })).json;
    expect(saved).toEqual({ sources: ['tecmundo'], topics: ['tec'] });
    expect((await ctx.inject('GET', '/api/news')).json.config).toEqual(saved);
  });
});
