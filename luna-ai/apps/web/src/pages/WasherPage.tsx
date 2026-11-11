import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, Pause, Play, Power } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { WasherDto } from '@luna/shared';
import { Page } from '../components/Layout';
import { WasherIcon, WasherSteps, hourOf, mins, washerLine, washerTone } from '../components/WasherCard';
import { Spinner } from '../components/ui';
import { useAuth } from '../stores/auth';
import { useWasher } from '../stores/washer';

const card: CSSProperties = { background: 'var(--card, rgba(8,24,36,.78))', border: '1px solid var(--line, rgba(0,229,255,.18))', borderRadius: 'var(--card-r, 24px)', padding: 16 };
const label = 'm-label text-[11.5px] tracking-[0.12em] uppercase opacity-70';

function Switch({ on, onChange, disabled, name }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; name: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={name} disabled={disabled} onClick={() => onChange(!on)} className="relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50" style={{ background: on ? 'linear-gradient(90deg,var(--accent-1),var(--accent-2))' : 'rgba(255,255,255,.14)' }}>
      <span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all" style={{ left: on ? 23 : 3 }} />
    </button>
  );
}

/** Anel do tempo restante. Sem início conhecido, o anel mostra só o tempo (sem fração). */
function Ring({ w }: { w: WasherDto }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const left = w.remainingMin ?? 0;
  let frac = w.status === 'end' ? 1 : 0;
  if (w.startedAt && w.remainingMin !== null) {
    const spent = (Date.now() - new Date(w.startedAt).getTime()) / 60_000;
    frac = Math.min(1, Math.max(0.02, spent / (spent + left)));
  }
  return (
    <svg viewBox="0 0 128 128" width={132} height={132} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="wr-acc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-2, #8b5cf6)" />
          <stop offset="1" stopColor="var(--accent-1, #22d3ee)" />
        </linearGradient>
      </defs>
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="9" />
      {frac > 0 && <circle cx="64" cy="64" r={r} fill="none" stroke="url(#wr-acc)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 64 64)" />}
      {w.status === 'end' ? (
        <text x="64" y="72" textAnchor="middle" fontSize="26" fill="currentColor">
          ✓
        </text>
      ) : (
        <>
          <text x="64" y="66" textAnchor="middle" fontSize={left >= 100 ? 22 : 26} fontWeight="700" fill="currentColor" style={{ fontFamily: 'var(--font-display)' }}>
            {w.remainingMin === null ? '—' : mins(left)}
          </text>
          <text x="64" y="86" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity=".6">
            {w.status === 'start' || w.status === 'pause' ? 'restantes' : 'de programa'}
          </text>
        </>
      )}
    </svg>
  );
}

/** Tela completa da lava e seca: tempo, etapas, ciclo atual, avisos e botões. */
export default function WasherPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { washers, load, setPower, setRunning, setPrefs, setVoice, busy } = useWasher();
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => void load(), [load]);
  // O anel e o “termina às” andam sozinhos entre as atualizações da máquina
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const w = washers?.find((x) => x.id === id);
  if (!w)
    return (
      <Page>
        <div className="flex justify-center py-16">{washers ? <p>Lava e seca não encontrada no Home Assistant.</p> : <Spinner />}</div>
      </Page>
    );

  const done = (err: string | null, ok: string) => setMsg(err ? { text: err, ok: false } : { text: ok, ok: true });
  const section = (title: string, body: ReactNode) => (
    <div style={card}>
      <p className={`${label} mb-3`}>{title}</p>
      {body}
    </div>
  );
  const active = w.status === 'start' || w.status === 'pause';
  const stepsVisible = active || w.status === 'end';

  return (
    <Page>
      <div className="mx-auto flex max-w-xl flex-col gap-3 pt-3 pb-4">
        <div className="flex items-center justify-between">
          <button className="m-iconbox" style={{ width: 40, height: 40 }} onClick={() => navigate(-1)} aria-label="Voltar">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className={label}>Lava e seca</p>
          <span style={{ width: 40 }} />
        </div>

        <div style={card} className="flex items-center gap-4">
          <WasherIcon size={88} spinning={w.status === 'start'} water={w.power} />
          <div className="min-w-0">
            <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              {w.name}
            </p>
            {w.program && <p className="m-muted mt-1 mb-2 text-[13px] opacity-70">{w.program}</p>}
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${washerTone(w)}`}>{w.statusLabel}</span>
          </div>
        </div>

        {w.power && w.available && (
          <div style={card}>
            <div className="flex items-center gap-4">
              <Ring w={w} />
              <div className="min-w-0 space-y-1.5 text-[13.5px]">
                {w.endsAt && (
                  <p className="text-[15px]">
                    Termina às <b>{hourOf(w.endsAt)}</b>
                  </p>
                )}
                {w.startedAt && <p className="m-muted opacity-70">Começou às {hourOf(w.startedAt)}</p>}
                {!w.endsAt && <p className="text-[15px]">{washerLine(w)}</p>}
                {w.status === 'standby' && <p className="m-muted opacity-70">Escolha o programa no painel e toque em Começar.</p>}
                {w.status === 'fault' && <p className="text-rose-200">A máquina está com erro. Confira o painel dela.</p>}
              </div>
            </div>
            {stepsVisible && (
              <div className="mt-4">
                <WasherSteps w={w} />
              </div>
            )}
          </div>
        )}

        {msg && <p className={`rounded-2xl px-4 py-2.5 text-sm ${msg.ok ? 'bg-emerald-400/10 text-emerald-100' : 'bg-rose-400/15 text-rose-100'}`}>{msg.text}</p>}

        {(w.canStart || w.canPower) && (
          <div style={{ ...card, padding: 12 }} className="flex gap-2">
            {w.canStart && w.power && (w.status === 'standby' || w.status === 'pause') && (
              <button className="m-chip act flex-[1.3] justify-center disabled:opacity-50" style={{ padding: 13, fontSize: 15 }} disabled={busy} onClick={async () => done(await setRunning(w.id, true), w.status === 'pause' ? 'A lava e seca vai continuar.' : 'Comando enviado: a lava e seca vai começar.')}>
                <Play className="h-4 w-4" /> {w.status === 'pause' ? 'Continuar' : 'Começar'}
              </button>
            )}
            {w.canStart && w.status === 'start' && (
              <button className="m-chip flex-[1.3] justify-center disabled:opacity-50" style={{ padding: 13, fontSize: 15 }} disabled={busy} onClick={async () => done(await setRunning(w.id, false), 'Comando enviado: a lava e seca vai pausar.')}>
                <Pause className="h-4 w-4" /> Pausar
              </button>
            )}
            {w.canPower && (
              <button
                className="m-chip flex-1 justify-center disabled:opacity-50"
                style={{ padding: 13, fontSize: 15 }}
                disabled={busy}
                onClick={async () => {
                  if (w.power && w.status === 'start' && !window.confirm('A máquina está lavando. Desligar agora interrompe o ciclo. Desligar mesmo assim?')) return;
                  done(await setPower(w.id, !w.power), w.power ? 'Comando enviado: a lava e seca vai desligar.' : 'Comando enviado: a lava e seca vai ligar.');
                }}
              >
                <Power className="h-4 w-4" /> {w.power ? 'Desligar' : 'Ligar'}
              </button>
            )}
          </div>
        )}

        {w.details.length > 0 &&
          section(
            'Ciclo atual',
            <>
              {w.details.map((d) => (
                <div key={d.label} className="flex justify-between border-t border-white/10 py-2 text-[14px] first:border-t-0">
                  <span className="m-muted opacity-75">{d.label}</span>
                  <span>{d.value}</span>
                </div>
              ))}
            </>,
          )}

        {section(
          'Avisos',
          <>
            <div className="flex items-center justify-between gap-3 pb-2.5">
              <div>
                <p className="text-sm">Avisar quando terminar</p>
                <p className="m-muted mt-0.5 text-xs opacity-60">no celular, no tablet e na TV</p>
              </div>
              <Switch name="Avisar quando terminar" on={w.notifyDone} disabled={busy} onChange={async (v) => done(await setPrefs(w.id, { notifyDone: v }), v ? 'Vou avisar quando a roupa ficar pronta.' : 'Aviso de término desligado.')} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2.5">
              <div>
                <p className="text-sm">Falar no tablet</p>
                <p className="m-muted mt-0.5 text-xs opacity-60">“A roupa está pronta” (app Luna no Android)</p>
              </div>
              <Switch name="Falar no tablet" on={w.speak} disabled={busy || !w.notifyDone} onChange={async (v) => done(await setPrefs(w.id, { speak: v }), v ? 'O tablet vai falar quando terminar.' : 'O tablet não vai falar.')} />
            </div>
            {isAdmin && (
              <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-white/10 pt-2.5">
                <div>
                  <p className="text-sm">Luna pode controlar pela voz</p>
                  <p className="m-muted mt-0.5 text-xs opacity-60">“Oi, Luna, pausa a máquina de lavar” (perguntar quanto falta sempre funciona)</p>
                </div>
                <Switch name="Luna pode controlar pela voz" on={w.voiceAllowed} disabled={busy} onChange={async (v) => done(await setVoice(w.id, v), v ? 'Comandos de voz autorizados.' : 'Comandos de voz desligados.')} />
              </div>
            )}
          </>,
        )}

        {section(
          'Uso',
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-white/5 p-3 text-center">
                <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  {w.weekCycles}
                </p>
                <p className="m-muted text-xs opacity-70">{w.weekCycles === 1 ? 'ciclo na semana' : 'ciclos na semana'}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3 text-center">
                <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  {w.avgMinutes !== null ? mins(w.avgMinutes) : '—'}
                </p>
                <p className="m-muted text-xs opacity-70">duração média</p>
              </div>
            </div>
            <p className="m-muted mt-2.5 text-xs opacity-60">A Luna conta os ciclos a partir de agora. A máquina não informa consumo de água nem de energia.</p>
          </>,
        )}
      </div>
    </Page>
  );
}
