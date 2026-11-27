import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { NewsConfigDto, NewsDto, NewsItemDto, NewsSourceDto, NewsTopic } from '@luna/shared';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Um feed: endereço e, quando o jornal só tem um feed geral, um filtro pelo endereço da matéria */
interface Feed {
  url: string;
  match?: RegExp;
}
interface Source {
  id: string;
  name: string;
  feeds: Partial<Record<NewsTopic, Feed>>;
}

const CNN = 'https://www.cnnbrasil.com.br/rss/';
/** Fontes gratuitas (RSS públicos dos próprios jornais). Só leitura de manchetes; a matéria abre no site. */
export const NEWS_SOURCES: Source[] = [
  {
    id: 'g1',
    name: 'g1',
    feeds: {
      sp: { url: 'https://g1.globo.com/rss/g1/sp/sao-paulo/' },
      mundo: { url: 'https://g1.globo.com/rss/g1/mundo/' },
      tec: { url: 'https://g1.globo.com/rss/g1/tecnologia/' },
      geral: { url: 'https://g1.globo.com/rss/g1/' },
    },
  },
  {
    id: 'cnn',
    name: 'CNN Brasil',
    feeds: {
      sp: { url: CNN, match: /\/(sudeste\/sp|sao-paulo)\// },
      mundo: { url: CNN, match: /\/internacional\// },
      tec: { url: CNN, match: /\/tecnologia\// },
      geral: { url: CNN },
    },
  },
  {
    id: 'folha',
    name: 'Folha',
    feeds: {
      sp: { url: 'https://feeds.folha.uol.com.br/cotidiano/rss091.xml' },
      mundo: { url: 'https://feeds.folha.uol.com.br/mundo/rss091.xml' },
      tec: { url: 'https://feeds.folha.uol.com.br/tec/rss091.xml' },
      geral: { url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml' },
    },
  },
  {
    id: 'estadao',
    name: 'Estadão',
    feeds: {
      sp: { url: 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/sao-paulo/' },
      mundo: { url: 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/internacional/' },
      tec: { url: 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/link/' },
    },
  },
  { id: 'bbc', name: 'BBC Brasil', feeds: { mundo: { url: 'https://feeds.bbci.co.uk/portuguese/rss.xml' } } },
  { id: 'agencia', name: 'Agência Brasil', feeds: { geral: { url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml' } } },
  { id: 'tecmundo', name: 'Tecmundo', feeds: { tec: { url: 'https://rss.tecmundo.com.br/feed' } } },
  { id: 'canaltech', name: 'Canaltech', feeds: { tec: { url: 'https://canaltech.com.br/rss/' } } },
  { id: 'olhar', name: 'Olhar Digital', feeds: { tec: { url: 'https://olhardigital.com.br/feed/' } } },
];

export const NEWS_TOPICS: NewsTopic[] = ['sp', 'mundo', 'tec', 'geral'];
const DEFAULT: NewsConfigDto = { sources: ['g1', 'cnn', 'folha'], topics: ['sp', 'mundo', 'tec'] };
const CACHE_MS = 15 * 60_000;
const PER_FEED = 12;

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
function decode(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENT[n.toLowerCase()] ?? m);
}
/** Conteúdo de uma tag: tira CDATA, tags HTML e entidades; espaços normalizados */
function text(raw: string | undefined) {
  if (!raw) return '';
  let s = raw.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
  s = decode(s); // o HTML pode vir escapado (&lt;p&gt;)
  s = s.replace(/<[^>]+>/g, ' ');
  return decode(s).replace(/\s+/g, ' ').trim();
}
function tag(item: string, name: string) {
  return item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1];
}
function imageOf(item: string) {
  const m =
    item.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i) ??
    item.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i) ??
    item.match(/<img[^>]*src=(?:"|&quot;)([^"&]+)/i);
  const url = m?.[1] ? decode(m[1]) : null;
  return url && /^https:\/\//.test(url) ? url : null;
}

/** Lê um RSS 2.0 (ou Atom simples) e devolve as matérias */
export function parseFeed(xml: string): { title: string; link: string; summary: string; at: string | null; image: string | null }[] {
  const items = xml.split(/<item[\s>]|<entry[\s>]/i).slice(1);
  return items.map((it) => {
    const title = text(tag(it, 'title'));
    const link = text(tag(it, 'link')) || (it.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '');
    const summary = text(tag(it, 'description') ?? tag(it, 'summary')).slice(0, 400);
    const when = text(tag(it, 'pubDate') ?? tag(it, 'published') ?? tag(it, 'updated') ?? tag(it, 'dc:date'));
    const t = when ? Date.parse(when) : NaN;
    return { title, link: decode(link.trim()), summary, at: Number.isFinite(t) ? new Date(t).toISOString() : null, image: imageOf(it) };
  });
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .slice(0, 60);

/**
 * Notícias do dia: manchetes dos jornais escolhidos nos Ajustes (São Paulo, mundo, tecnologia…),
 * buscadas no servidor a cada 15 min. Escolhas ficam em news.json.
 */
export class NewsService {
  private file: string;
  private cache = new Map<string, { at: number; xml: string }>();
  private inflight = new Map<string, Promise<string>>();
  private failed = new Set<string>();
  /** id da notícia → endereço original da foto (só essas podem ser buscadas pelo servidor) */
  private photos = new Map<string, string>();
  private photoCache = new Map<string, { type: string; body: Buffer }>();

  constructor(
    dataDir: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'news.json');
  }

  catalog(): NewsSourceDto[] {
    return NEWS_SOURCES.map((s) => ({ id: s.id, name: s.name, topics: NEWS_TOPICS.filter((t) => s.feeds[t]) }));
  }

  config(): NewsConfigDto {
    try {
      const c = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<NewsConfigDto>;
      const sources = (c.sources ?? []).filter((id) => NEWS_SOURCES.some((s) => s.id === id));
      const topics = (c.topics ?? []).filter((t) => NEWS_TOPICS.includes(t));
      return { sources: sources.length ? sources : DEFAULT.sources, topics: topics.length ? topics : DEFAULT.topics };
    } catch {
      return DEFAULT;
    }
  }

  saveConfig(c: NewsConfigDto): NewsConfigDto {
    const clean: NewsConfigDto = {
      sources: [...new Set(c.sources)].filter((id) => NEWS_SOURCES.some((s) => s.id === id)),
      topics: NEWS_TOPICS.filter((t) => c.topics.includes(t)),
    };
    writeFileSync(this.file, JSON.stringify(clean, null, 2), { mode: 0o600 });
    return this.config();
  }

  private async get(url: string): Promise<string> {
    const hit = this.cache.get(url);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.xml;
    const running = this.inflight.get(url);
    if (running) return running;
    const p = (async () => {
      try {
        const res = await this.fetcher(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; LunaCasa/1.0; +rss)', accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(12_000) });
        if (!res.ok) throw new Error(String(res.status));
        // Alguns jornais (Folha) ainda publicam em ISO-8859-1: lê os bytes e decodifica pelo que o XML declara
        const buf = new Uint8Array(await res.arrayBuffer());
        const head = new TextDecoder('latin1').decode(buf.slice(0, 200));
        const enc = (/encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8').toLowerCase();
        let xml: string;
        try {
          xml = new TextDecoder(enc).decode(buf);
        } catch {
          xml = new TextDecoder('utf-8').decode(buf);
        }
        this.cache.set(url, { at: this.now(), xml });
        this.failed.delete(url);
        return xml;
      } catch {
        this.failed.add(url);
        if (hit) return hit.xml; // sem resposta: usa a última que deu certo
        return '';
      } finally {
        this.inflight.delete(url);
      }
    })();
    this.inflight.set(url, p);
    return p;
  }

  async list(): Promise<NewsDto> {
    const config = this.config();
    const jobs: Promise<NewsItemDto[]>[] = [];
    const failedNames = new Set<string>();
    for (const src of NEWS_SOURCES.filter((s) => config.sources.includes(s.id))) {
      for (const topic of config.topics) {
        const feed = src.feeds[topic];
        if (!feed) continue;
        jobs.push(
          this.get(feed.url).then((xml) => {
            if (!xml && this.failed.has(feed.url)) failedNames.add(src.name);
            return parseFeed(xml)
              .filter((i) => i.title && /^https?:\/\//.test(i.link) && (!feed.match || feed.match.test(i.link)))
              .slice(0, PER_FEED)
              .map((i) => ({
                id: createHash('sha1').update(i.link).digest('hex').slice(0, 16),
                title: i.title,
                summary: i.summary.startsWith(i.title) ? i.summary.slice(i.title.length).replace(/^[\s.:–-]+/, '') : i.summary,
                link: i.link,
                source: src.id,
                sourceName: src.name,
                topic,
                at: i.at,
                image: i.image,
              }));
          }),
        );
      }
    }
    const all = (await Promise.all(jobs)).flat();
    // A mesma matéria em dois feeds (ex.: geral e SP): fica uma só
    const seen = new Set<string>();
    const perTopic = new Map<NewsTopic, number>();
    const items = all
      .sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0))
      .filter((i) => {
        const k = `${i.topic}:${norm(i.title)}`;
        if (seen.has(k) || seen.has(i.link)) return false;
        const n = perTopic.get(i.topic) ?? 0;
        if (n >= 40) return false; // até 40 por assunto (as mais novas)
        perTopic.set(i.topic, n + 1);
        seen.add(k);
        seen.add(i.link);
        return true;
      });
    // As fotos passam pelo servidor: a página da Luna só carrega imagens dela mesma (segurança)
    for (const i of items) {
      if (!i.image) continue;
      // CNN (WordPress) manda miniatura de 200 px (?w=200): pede uma de 800 px, que fica nítida no carrossel
      this.photos.set(i.id, i.image.replace(/([?&])w=\d{2,3}(?=&|$)/, '$1w=800'));
      i.image = `/api/news/image/${i.id}`;
    }
    if (this.photos.size > 600) for (const k of [...this.photos.keys()].slice(0, this.photos.size - 600)) this.photos.delete(k);
    return { items, config, catalog: this.catalog(), failed: [...failedNames] };
  }

  /** Foto de uma notícia já listada (nunca um endereço qualquer). Guarda as últimas 80 na memória. */
  async photo(id: string): Promise<{ type: string; body: Buffer } | null> {
    const hit = this.photoCache.get(id);
    if (hit) return hit;
    const url = this.photos.get(id);
    if (!url) return null;
    try {
      const res = await this.fetcher(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; LunaCasa/1.0)', accept: 'image/*' }, signal: AbortSignal.timeout(10_000) });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/')) return null;
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > 3_000_000) return null;
      const out = { type, body };
      this.photoCache.set(id, out);
      if (this.photoCache.size > 80) this.photoCache.delete(this.photoCache.keys().next().value!);
      return out;
    } catch {
      return null;
    }
  }
}
