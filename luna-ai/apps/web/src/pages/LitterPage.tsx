import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { LitterCatDto } from '@luna/shared';
import { Page } from '../components/Layout';
import { LitterIcon, ago, kg, litterColor } from '../components/LitterCard';
import { Spinner } from '../components/ui';
import { useAuth } from '../stores/auth';
import { useLitter } from '../stores/litter';

const card: CSSProperties = { background: 'var(--card, rgba(8,24,36,.78))', border: '1px solid var(--line, rgba(0,229,255,.18))', borderRadius: 'var(--card-r, 24px)', padding: 16 };
const label = 'm-label text-[11.5px] tracking-[0.12em] uppercase opacity-70';
const CAT_COLORS = ['#22d3ee', '#8b5cf6', '#f472b6', '#fbbf24', '#34d399', '#fb7185'];
const DELAYS = [60, 180, 300, 600];
const hour = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dur = (s: number | null) => (s === null || s <= 0 ? null : s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
const wait = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} segundo${s === 1 ? '' : 's'}`);
const weekday = (date: string, i: number) => (i === 6 ? 'hoje' : new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));

function Switch({ on, onChange, disabled, name }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; name: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={name} disabled={disabled} onClick={() => onChange(!on)} className="relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50" style={{ background: on ? 'linear-gradient(90deg,var(--accent-1),var(--accent-2))' : 'rgba(255,255,255,.14)' }}>
      <span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all" style={{ left: on ? 23 : 3 }} />
    </button>
  );
}

/** Editar nome e peso de um gato (o peso também é aprendido sozinho pelas visitas). */
function CatEditor({ cat, onDone }: { cat: LitterCatDto; onDone: () => void }) {
  const updateCat = useLitter((s) => s.updateCat);
  const [name, setName] = useState(cat.name);
  const [weight, setWeight] = useState(cat.weightKg !== null ? String(cat.weightKg).replace('.', ',') : '');
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const w = weight.trim() ? Number(weight.replace(',', '.')) : null;
    if (w !== null && !(w >= 0.5 && w <= 15)) return setErr('Peso entre 0,5 e 15 kg.');
    const e = await updateCat(cat.id, { name: name.trim() || cat.name, weightKg: w === null ? (cat.weightSet ? null : undefined) : w });
    if (e) setErr(e);
    else onDone();
  };
  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-white/5 p-3 text-sm">
      <input className="w-full rounded-xl bg-black/30 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Nome" aria-label="Nome do gato" />
      <input className="w-full rounded-xl bg-black/30 px-3 py-2" value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="Peso em kg (vazio = a Luna aprende sozinha)" aria-label="Peso do gato" />
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <div className="flex gap-2">
        <button className="m-chip act flex-1 justify-center" onClick={() => void save()}>
          Salvar
        </button>
        <button className="m-chip flex-1 justify-center" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Tela completa da caixa de areia: limpar, limpeza automática, visitas e quem usou (pelo peso). */
export default function LitterPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { boxes, load, clean, setAuto, setVoice, busy } = useLitter();
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const b = boxes?.find((x) => x.id === id);
  if (!b)
    return (
      <Page>
        <div className="flex justify-center py-16">{boxes ? <p>Caixa de areia não encontrada no Home Assistant.</p> : <Spinner />}</div>
      </Page>
    );

  const done = (err: string | null, ok: string) => setMsg(err ? { text: err, ok: false } : { text: ok, ok: true });
  const max = Math.max(1, ...b.week.map((d) => d.count));
  const past = b.week.slice(0, 6).filter((d) => d.count > 0);
  const avg = past.length >= 3 ? Math.round(past.reduce((s, d) => s + d.count, 0) / past.length) : null;
  const section = (title: string, body: ReactNode, extra?: CSSProperties) => (
    <div style={{ ...card, ...extra }}>
      <p className={`${label} mb-3`}>{title}</p>
      {body}
    </div>
  );
  const alerts = b.cats.filter((c) => c.alert);

  return (
    <Page>
      <div className="mx-auto flex max-w-xl flex-col gap-3 pt-3 pb-4">
        <div className="flex items-center justify-between">
          <button className="m-iconbox" style={{ width: 40, height: 40 }} onClick={() => navigate(-1)} aria-label="Voltar">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className={label}>Caixa de areia</p>
          <span style={{ width: 40 }} />
        </div>

        <div style={card} className="flex items-center gap-4">
          <LitterIcon size={88} glow={litterColor(b)} />
          <div className="min-w-0">
            <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              {b.name}
            </p>
            <p className="m-muted mt-1 mb-2 text-[13px] opacity-70">
              {b.lastVisit ? `Última visita às ${hour(b.lastVisit.at)}${b.lastVisit.weightKg !== null ? ` · ${kg(b.lastVisit.weightKg)}` : ''}${dur(b.lastVisit.durationS) ? ` · ficou ${dur(b.lastVisit.durationS)}` : ''}` : 'Ainda sem visitas registradas pela Luna'}
            </p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${b.available ? 'bg-emerald-400/15 text-emerald-100' : 'bg-white/10 text-white/60'}`}>{b.statusLabel}</span>
          </div>
        </div>

        {b.canClean && (
          <div style={{ ...card, padding: 12 }}>
            <button className="m-chip act w-full justify-center disabled:opacity-50" style={{ padding: 13, fontSize: 15 }} disabled={busy || !b.available} onClick={async () => done(await clean(b.id), 'Comando enviado: a caixa vai fazer a limpeza.')}>
              🧹 Limpar agora
            </button>
          </div>
        )}

        {msg && <p className={`rounded-2xl px-4 py-2.5 text-sm ${msg.ok ? 'bg-emerald-400/10 text-emerald-100' : 'bg-rose-400/15 text-rose-100'}`}>{msg.text}</p>}

        {b.autoClean === false && (
          <div style={{ ...card, background: 'rgba(251,191,36,.08)', borderColor: 'rgba(251,191,36,.3)' }}>
            <p className="text-[13.5px] text-amber-100">⚠️ A limpeza automática está desligada: a caixa só limpa quando alguém manda.</p>
            <button className="m-chip mt-2.5 w-full justify-center" disabled={busy} onClick={async () => done(await setAuto(b.id, true, 180), 'Limpeza automática ligada, com 3 min de espera.')}>
              Ligar com espera de 3 min
            </button>
          </div>
        )}

        {section(
          'Visitas — últimos 7 dias',
          <>
            <div className="flex h-24 items-end gap-2">
              {b.week.map((d, i) => (
                <div key={d.date} className="flex-1 text-center">
                  <div className="text-[11px] opacity-70">{d.count || ''}</div>
                  <div className="rounded-t-lg rounded-b" style={{ height: Math.max(3, (d.count / max) * 64), background: i === 6 ? 'linear-gradient(180deg,var(--accent-1),var(--accent-2))' : 'rgba(255,255,255,.12)' }} />
                  <p className="m-muted mt-1 text-[11px] opacity-70">{weekday(d.date, i)}</p>
                </div>
              ))}
            </div>
            <p className="m-muted mt-2.5 text-[12.5px] opacity-70">
              {!b.historySince
                ? 'A Luna registra as visitas a partir de agora (o Home Assistant não guarda histórico).'
                : avg !== null
                  ? `Média de ${avg} visitas por dia.${b.week[6]!.count > avg * 1.8 && new Date().getHours() >= 12 ? ' Hoje está bem acima do normal — vale observar os gatos.' : ''}`
                  : `Registrando desde ${new Date(b.historySince).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}.`}
            </p>
          </>,
        )}

        {section(
          'Quem usou hoje (pelo peso)',
          <>
            {b.cats.map((c, i) => (
              <div key={c.id} className="border-t border-white/10 first:border-t-0">
                <button className="flex w-full items-center gap-2.5 py-2 text-left" onClick={() => setEditing(editing === c.id ? null : c.id)} aria-label={`Editar ${c.name}`}>
                  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[15px]" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}>
                    🐱
                  </span>
                  <span className="flex-1 text-sm">{c.name}</span>
                  <span className="m-muted w-16 text-[12.5px] opacity-70">{c.weightKg !== null ? kg(c.weightKg) : 'aprendendo'}</span>
                  <span className="w-[72px] text-right text-[13px]">
                    {c.todayVisits} {c.todayVisits === 1 ? 'visita' : 'visitas'}
                  </span>
                </button>
                {editing === c.id && <CatEditor cat={c} onDone={() => setEditing(null)} />}
              </div>
            ))}
            {alerts.map((c) => (
              <p key={c.id} className="mt-2.5 rounded-xl bg-amber-400/12 px-2.5 py-2 text-[12.5px] text-amber-100">
                ⚠️ {c.alert}
              </p>
            ))}
            <p className="m-muted mt-2.5 text-xs opacity-60">Toque num gato para dar o nome ou acertar o peso. Sem peso informado, a Luna aprende sozinha pelas primeiras visitas.</p>
          </>,
        )}

        {b.recent.length > 0 &&
          section(
            'Últimas visitas',
            <>
              {b.recent.map((v) => (
                <div key={v.id} className="flex justify-between border-t border-white/10 py-1.5 text-[13.5px] first:border-t-0">
                  <span>
                    {hour(v.at)} · {v.catName ?? 'gato não reconhecido'}
                  </span>
                  <span className="m-muted opacity-70">
                    {kg(v.weightKg)}
                    {dur(v.durationS) ? ` · ${dur(v.durationS)}` : ''} · {ago(v.at)}
                  </span>
                </div>
              ))}
            </>,
          )}

        {section(
          'Ajustes',
          <>
            {b.autoClean !== null && (
              <div className="flex items-center justify-between gap-3 pb-2.5">
                <div>
                  <p className="text-sm">Limpeza automática</p>
                  <p className="m-muted mt-0.5 text-xs opacity-60">limpa sozinha depois que o gato sai</p>
                </div>
                <Switch name="Limpeza automática" on={b.autoClean} disabled={busy} onChange={async (v) => done(await setAuto(b.id, v), v ? 'Limpeza automática ligada.' : 'Limpeza automática desligada.')} />
              </div>
            )}
            {b.delaySeconds !== null && (
              <div className="border-t border-white/10 pt-2.5">
                <p className="mb-2 text-sm">Esperar antes de limpar</p>
                <div className="flex gap-1.5">
                  {DELAYS.filter((d) => d <= (b.delayMax ?? 600)).map((d) => (
                    <button
                      key={d}
                      disabled={busy}
                      className={`m-chip flex-1 justify-center disabled:opacity-50 ${b.delaySeconds === d ? 'act' : ''}`}
                      style={{ padding: '8px 6px', fontSize: 13 }}
                      onClick={async () => done(await setAuto(b.id, b.autoClean ?? true, d), `Espera de ${wait(d)} antes de limpar.`)}
                    >
                      {wait(d)}
                    </button>
                  ))}
                </div>
                <p className="m-muted mt-2 text-xs opacity-60">
                  Agora: {wait(b.delaySeconds)}.{b.delaySeconds < 60 ? ' É pouco tempo: o gato pode ainda estar perto quando a caixa girar.' : ''}
                </p>
              </div>
            )}
            {isAdmin && (
              <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-white/10 pt-2.5">
                <div>
                  <p className="text-sm">Luna pode controlar pela voz</p>
                  <p className="m-muted mt-0.5 text-xs opacity-60">“Oi, Luna, limpa a caixa de areia”</p>
                </div>
                <Switch name="Luna pode controlar pela voz" on={b.voiceAllowed} disabled={busy} onChange={async (v) => done(await setVoice(b.id, v), v ? 'Comandos de voz autorizados.' : 'Comandos de voz desligados.')} />
              </div>
            )}
          </>,
        )}
      </div>
    </Page>
  );
}
