import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import type { NewsDto, NewsItemDto, NewsTopic } from '@luna/shared/types';
import { api } from '../services/api';
import { nativeApp } from '../lib/native';

export const TOPIC_LABEL: Record<NewsTopic, string> = { sp: 'São Paulo', mundo: 'Mundo', tec: 'Tecnologia', geral: 'Brasil' };
/** Rótulos curtos para as abas (cabem numa linha da telinha) */
const TAB: Record<NewsTopic, string> = { sp: 'SP', mundo: 'Mundo', tec: 'Tec', geral: 'Brasil' };
const REFRESH_MS = 15 * 60_000;

/** “há 5 min”, “há 2 h”, “ontem” */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return '';
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  return h < 48 ? 'ontem' : `há ${Math.round(h / 24)} dias`;
}

/** Abre a matéria: no app Android vai para o navegador (o app só mostra a Luna); no navegador, outra aba. */
function openLink(url: string) {
  if (nativeApp()) {
    window.location.assign(url);
    return;
  }
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
}

let cache: { at: number; data: NewsDto } | null = null;

/** Manchetes do dia (jornais e assuntos escolhidos em Ajustes › Notícias), com abas por assunto. */
export function NewsCard({ className = '', max }: { className?: string; max?: number }) {
  const [data, setData] = useState<NewsDto | null>(cache?.data ?? null);
  const [topic, setTopic] = useState<NewsTopic | null>(null);
  const [open, setOpen] = useState<NewsItemDto | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      if (cache && Date.now() - cache.at < REFRESH_MS / 3) {
        setData(cache.data);
        return;
      }
      api<NewsDto>('/api/news').then(
        (d) => {
          cache = { at: Date.now(), data: d };
          if (alive) setData(d);
        },
        () => undefined,
      );
    };
    load();
    const t = window.setInterval(() => {
      load();
      tick((n) => n + 1); // atualiza o “há X min”
    }, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  if (!data) return null;
  const topics = data.config.topics.filter((t) => data.items.some((i) => i.topic === t));
  if (!topics.length) return null;
  const cur = topic && topics.includes(topic) ? topic : topics[0]!;
  const items = data.items.filter((i) => i.topic === cur).slice(0, max ?? 40);

  return (
    <div className={`pn-card pn-news ${className}`}>
      <div className="pn-news-tabs">
        <p className="pn-label">Notícias</p>
        {topics.map((t) => (
          <button key={t} className={t === cur ? 'on' : ''} onClick={() => setTopic(t)}>
            {TAB[t]}
          </button>
        ))}
      </div>
      <ul className="pn-news-list">
        {items.map((i) => (
          <li key={i.id}>
            <button onClick={() => setOpen(i)}>
              <b>{i.title}</b>
              <small>
                {i.sourceName}
                {i.at ? ` · ${ago(i.at)}` : ''}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="pn-news-modal" onClick={() => setOpen(null)}>
          <article className="pn-news-read" onClick={(e) => e.stopPropagation()}>
            <button className="pn-x pn-news-x" onClick={() => setOpen(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
            {open.image && <img src={open.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <p className="pn-label">
              {open.sourceName} · {TOPIC_LABEL[open.topic]}
              {open.at ? ` · ${ago(open.at)}` : ''}
            </p>
            <h3>{open.title}</h3>
            {open.summary && <p>{open.summary}</p>}
            <button className="pn-news-open" onClick={() => openLink(open.link)}>
              <ExternalLink className="h-4 w-4" /> Ler a matéria no site
            </button>
          </article>
        </div>
      )}
    </div>
  );
}
