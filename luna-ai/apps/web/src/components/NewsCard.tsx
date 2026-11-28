import { useEffect, useMemo, useRef, useState } from 'react';
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
const SLIDE_MS = 7000;
/** Depois de mexer no carrossel, espera um pouco antes de voltar a andar sozinho */
const RESUME_MS = 20_000;

type Tab = NewsTopic | 'tudo';

/** Intercala os assuntos (SP, mundo, tec, SP, mundo…) para a aba “Tudo” */
function interleave(items: NewsItemDto[], topics: NewsTopic[]) {
  const by = topics.map((t) => items.filter((i) => i.topic === t));
  const out: NewsItemDto[] = [];
  for (let k = 0; out.length < items.length && k < 60; k++) for (const list of by) if (list[k]) out.push(list[k]!);
  return out;
}

/**
 * Manchetes do dia num carrossel que anda sozinho (uma por vez, com a foto da matéria). Arraste para o
 * lado para passar; toque para ver o resumo e abrir no site. Jornais e assuntos: Ajustes › Notícias.
 */
export function NewsCard({ className = '', max = 30 }: { className?: string; max?: number }) {
  const [data, setData] = useState<NewsDto | null>(cache?.data ?? null);
  const [tab, setTab] = useState<Tab>('tudo');
  const [open, setOpen] = useState<NewsItemDto | null>(null);
  const [idx, setIdx] = useState(0);
  const [, tick] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);

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

  const topics = data ? data.config.topics.filter((t) => data.items.some((i) => i.topic === t)) : [];
  const cur: Tab = tab !== 'tudo' && topics.includes(tab) ? tab : 'tudo';
  const items = useMemo(() => (data ? (cur === 'tudo' ? interleave(data.items, topics) : data.items.filter((i) => i.topic === cur)).slice(0, max) : []), [data, cur, max, topics.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Anda sozinho; para enquanto o resumo está aberto, a aba não está visível ou a pessoa mexeu
  useEffect(() => {
    if (open || items.length < 2) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() < pausedUntil.current) return;
      const el = track.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % items.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: next === 0 ? 'auto' : 'smooth' });
    }, SLIDE_MS);
    return () => window.clearInterval(t);
  }, [open, items.length]);
  useEffect(() => {
    track.current?.scrollTo({ left: 0 });
    setIdx(0);
  }, [cur]);

  if (!data || !topics.length) return null;
  const onScroll = () => {
    const el = track.current;
    if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  const hold = () => (pausedUntil.current = Date.now() + RESUME_MS);
  const go = (d: number) => {
    hold();
    const el = track.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(items.length - 1, idx + d)) * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className={`pn-card pn-news ${className}`}>
      <div className="pn-news-tabs" aria-label="Notícias">
        {(['tudo', ...topics] as Tab[]).map((t) => (
          <button key={t} className={t === cur ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'tudo' ? 'Tudo' : TAB[t]}
          </button>
        ))}
      </div>
      <div className="pn-news-track" ref={track} onScroll={onScroll} onPointerDown={hold} onWheel={hold}>
        {items.map((i) => (
          <button key={i.id} className={`pn-news-slide ${i.image ? 'img' : ''}`} onClick={() => setOpen(i)}>
            {i.image && <img src={i.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />}
            <span className="pn-news-txt">
              <small>
                {TOPIC_LABEL[i.topic]} · {i.sourceName}
                {i.at ? ` · ${ago(i.at)}` : ''}
              </small>
              <b>{i.title}</b>
            </span>
          </button>
        ))}
      </div>
      <div className="pn-news-nav">
        <button onClick={() => go(-1)} aria-label="Anterior" disabled={idx === 0}>
          ‹
        </button>
        <span>
          {Math.min(idx + 1, items.length)} / {items.length}
        </span>
        <button onClick={() => go(1)} aria-label="Próxima" disabled={idx >= items.length - 1}>
          ›
        </button>
      </div>
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
