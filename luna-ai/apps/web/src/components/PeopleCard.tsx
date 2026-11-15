import { useEffect, useState } from 'react';
import type { PersonDto } from '@luna/shared/types';
import { usePeople } from '../stores/people';

const since = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'desde' : 'desde ' + d.toLocaleDateString('pt-BR', { weekday: 'short' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

function Avatar({ p, size = 44 }: { p: PersonDto; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {p.picture && !broken ? (
        <img src={`/api/people/${p.id}/photo`} alt="" onError={() => setBroken(true)} className={`h-full w-full rounded-full object-cover ${p.home ? '' : 'opacity-50 grayscale'}`} />
      ) : (
        <span className={`grid h-full w-full place-items-center rounded-full text-lg font-semibold ${p.home ? 'text-[#06070d]' : 'bg-white/10 text-white/60'}`} style={p.home ? { background: 'linear-gradient(135deg,var(--accent-1),var(--accent-2))' } : undefined}>
          {p.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={`absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[#06070d] ${p.home ? 'bg-emerald-400' : 'bg-white/30'}`} />
    </span>
  );
}

/** Cartão “Quem está em casa” (pessoas do Home Assistant). Some se não houver pessoas cadastradas. */
export function PeopleCard() {
  const list = usePeople((s) => s.list);
  useEffect(() => {
    if (!usePeople.getState().list) void usePeople.getState().load();
  }, []);
  if (!list?.length) return null;
  const home = list.filter((p) => p.home).length;
  return (
    <div className="m-card">
      <div className="flex items-center justify-between">
        <p className="m-label">Quem está em casa</p>
        <span className="m-muted text-xs">{home === 0 ? 'ninguém em casa' : `${home} de ${list.length} em casa`}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {list.map((p) => (
          <div key={p.id} className="flex min-w-[140px] items-center gap-3">
            <Avatar p={p} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{p.name}</p>
              <p className={`text-xs ${p.home ? 'text-emerald-300' : 'm-muted opacity-70'}`}>
                {p.place}
                {p.since ? ` · ${since(p.since)}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Linha curta para o descanso de tela: “Em casa: Daniel e Ana” */
export function peopleLine(list: PersonDto[] | null): string | null {
  if (!list?.length) return null;
  const home = list.filter((p) => p.home).map((p) => p.name);
  if (!home.length) return 'Ninguém em casa';
  return `Em casa: ${home.length > 1 ? `${home.slice(0, -1).join(', ')} e ${home.at(-1)}` : home[0]}`;
}
