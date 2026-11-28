import { useEffect, useState } from 'react';
import type { NewsConfigDto, NewsDto, NewsTopic } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { TOPIC_LABEL } from './NewsCard';

const TOPICS: NewsTopic[] = ['sp', 'mundo', 'tec', 'geral'];

/**
 * Ajustes › Notícias: quais jornais e assuntos aparecem no Painel. As manchetes vêm dos RSS públicos
 * dos próprios jornais (de graça), buscados pelo servidor a cada 15 min.
 */
export function NewsSettings({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<NewsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<NewsDto>('/api/news').then(setData, (e) => setError(errorMessage(e)));
  }, []);
  const save = async (config: NewsConfigDto) => {
    if (!data) return;
    setError(null);
    setData({ ...data, config });
    try {
      await api('/api/news/config', { method: 'PUT', body: config });
      setData(await api<NewsDto>('/api/news'));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  if (!data) return <p className="p-4 text-xs text-white/45">{error ?? 'Carregando…'}</p>;
  const { sources, topics } = data.config;
  const flipSource = (id: string) => void save({ topics, sources: sources.includes(id) ? sources.filter((x) => x !== id) : [...sources, id] });
  const flipTopic = (t: NewsTopic) => void save({ sources, topics: topics.includes(t) ? topics.filter((x) => x !== t) : TOPICS.filter((x) => x === t || topics.includes(x)) });
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs ${on ? 'border-sky-300/60 bg-sky-300/15 text-sky-100' : 'border-white/10 text-white/60'} disabled:opacity-40`;
  const count = (t: NewsTopic) => data.items.filter((i) => i.topic === t).length;
  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="text-xs text-white/50">Manchetes no Painel (embaixo da previsão do tempo), atualizadas a cada 15 min. Toque numa notícia para ver o resumo e abrir a matéria no site do jornal.</p>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Assuntos</p>
      <div className="flex flex-wrap gap-2">
        {TOPICS.map((t) => (
          <button key={t} type="button" disabled={!isAdmin || (topics.includes(t) && topics.length === 1)} onClick={() => flipTopic(t)} aria-pressed={topics.includes(t)} className={chip(topics.includes(t))}>
            {TOPIC_LABEL[t]}
            {topics.includes(t) ? ` · ${count(t)}` : ''}
          </button>
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Jornais</p>
      <div className="flex flex-wrap gap-2">
        {data.catalog.map((s) => {
          const on = sources.includes(s.id);
          return (
            <button key={s.id} type="button" disabled={!isAdmin || (on && sources.length === 1)} onClick={() => flipSource(s.id)} aria-pressed={on} className={chip(on)} title={s.topics.map((t) => TOPIC_LABEL[t]).join(', ')}>
              {s.name}
              <span className="ml-1 opacity-60">{s.topics.map((t) => TOPIC_LABEL[t]).join(' · ')}</span>
            </button>
          );
        })}
      </div>
      {data.failed.length > 0 && <p className="text-xs text-amber-200/80">Sem resposta agora: {data.failed.join(', ')} (tenta de novo sozinho).</p>}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
