import { useEffect, useRef } from 'react';
import { CheckCircle2, Mic, XCircle } from 'lucide-react';
import type { UiMessage } from '../stores/assistant';
import { PROVIDER_LABEL } from '../lib/text';

export function MessageList({ messages, interim, compact }: { messages: UiMessage[]; interim?: string; compact?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, interim]);
  return (
    <div className={`flex flex-col gap-3 ${compact ? '' : 'py-2'}`}>
      {messages.map((m) => (
        <div key={m.id} className={`animate-fade-up flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'rounded-br-md bg-gradient-to-br from-violet-600/80 to-indigo-600/80 text-white'
                : m.error
                  ? 'rounded-bl-md border border-rose-500/30 bg-rose-500/10 text-rose-100'
                  : 'glass rounded-bl-md text-white/90'
            }`}
          >
            {m.content}
            {!!m.actions?.length && (
              <ul className="mt-2 space-y-1 border-t border-white/10 pt-2 text-xs">
                {m.actions.map((a, i) => (
                  <li key={i} className={`flex items-center gap-1.5 ${a.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {a.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {a.summary}
                  </li>
                ))}
              </ul>
            )}
            {!!m.notices?.length && <p className="mt-1.5 text-[11px] text-amber-200/70">{m.notices.join(' ')}</p>}
            {m.role === 'assistant' && m.provider && (
              <p className="mt-1 flex items-center gap-1 text-[10px] tracking-wide text-white/35 uppercase">
                {m.channel === 'voice' && <Mic className="h-3 w-3" />}
                {PROVIDER_LABEL[m.provider] ?? m.provider}
              </p>
            )}
          </div>
        </div>
      ))}
      {interim && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed border-violet-400/40 px-4 py-2.5 text-[15px] text-white/60 italic">{interim}</div>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
