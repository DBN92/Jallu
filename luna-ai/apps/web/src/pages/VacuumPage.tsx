import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, Ellipsis, House, ImagePlus, LocateFixed, Pause, Play, Square, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DeviceDto, VacuumControl, VacuumCommand } from '@luna/shared';
import { Page } from '../components/Layout';
import { RobotImage, squareJpeg } from '../components/RobotImage';
import { fanLabel } from '../components/VacuumCard';
import { Spinner } from '../components/ui';
import { useDevices } from '../stores/devices';

// Os cartões seguem o tema; no HUD (sem variáveis do tema moderno) usam um fundo próprio
const card: CSSProperties = { background: 'var(--card, rgba(8,24,36,.78))', border: '1px solid var(--line, rgba(0,229,255,.18))', borderRadius: 'var(--card-r, 24px)', padding: 16 };
const label = 'm-label text-[11.5px] tracking-[0.12em] uppercase opacity-70';

const duration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};

function Chips({ options, value, onPick, busy }: { options: { value: string; label: string }[]; value: unknown; onPick: (v: string) => void; busy: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} disabled={busy} onClick={() => onPick(o.value)} className={`m-chip flex-1 justify-center disabled:opacity-50 ${o.value === value ? 'act' : ''}`} style={{ padding: '8px 10px', fontSize: 13.5, minWidth: 0 }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, disabled, label: name }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={name}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50"
      style={{ background: on ? 'linear-gradient(90deg,var(--accent-1),var(--accent-2))' : 'rgba(255,255,255,.14)' }}
    >
      <span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all" style={{ left: on ? 23 : 3 }} />
    </button>
  );
}

/** Tela completa do aspirador: comandos, sucção, água, estação, manutenção, limpezas e ajustes. */
export default function VacuumPage() {
  const { entityId = '' } = useParams();
  const navigate = useNavigate();
  const device = useDevices((s) => s.devices[entityId]) as DeviceDto | undefined;
  const { load, vacuum, vacuumExtra, vacuumPhoto } = useDevices();
  const busyMap = useDevices((s) => s.busy);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!device) void load(true);
  }, [device, load]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  if (!device?.vacuum)
    return (
      <Page>
        <div className="flex justify-center py-16">{device ? <p>Este aparelho não é um aspirador.</p> : <Spinner />}</div>
      </Page>
    );
  const v = device.vacuum;
  const x = v.extras;
  const ctrl = (key: string) => x?.controls.find((c) => c.key === key);
  const busy = !!busyMap[entityId];
  const run = async (cmd: VacuumCommand, fan?: string) => {
    const err = await vacuum(entityId, cmd, fan);
    setMsg(err ? { text: err, ok: false } : null);
    return err;
  };
  const extra = async (c: VacuumControl, value?: string | boolean, done?: string) => {
    const err = await vacuumExtra(entityId, c.id, value);
    setMsg(err ? { text: err, ok: false } : done ? { text: done, ok: true } : null);
  };
  const choosePhoto = async (file: File | undefined) => {
    setMenu(false);
    if (!file) return;
    try {
      const err = await vacuumPhoto(entityId, await squareJpeg(file));
      setMsg(err ? { text: err, ok: false } : { text: 'Foto do robô atualizada.', ok: true });
    } catch {
      setMsg({ text: 'Não consegui ler essa foto. Tente outra.', ok: false });
    }
  };

  const cleaning = v.phase === 'cleaning';
  const badge =
    v.phase === 'error' ? ['Precisa de ajuda', 'bg-rose-400/20 text-rose-100'] : cleaning ? ['Limpando', 'bg-cyan-400/15 text-cyan-100'] : v.phase === 'returning' ? ['Voltando para a base', 'bg-violet-400/15 text-violet-100'] : v.phase === 'paused' ? ['Pausado', 'bg-amber-400/15 text-amber-100'] : ['Disponível para limpar', 'bg-emerald-400/15 text-emerald-100'];
  const statusLine = [x?.charging && v.phase === 'docked' ? `${x.charging} na base` : v.status, v.battery !== null ? `${v.battery}%` : null, x?.dryingMinutes ? `pano secando (faltam ${duration(x.dryingMinutes)})` : null].filter(Boolean).join(' · ');

  // Sucção: da Xiaomi Home (seletor) ou do próprio aspirador
  const suction = ctrl('suction');
  const suctionOpts = suction?.options ?? v.fanSpeeds.map((f) => ({ value: f, label: fanLabel(f) }));
  const water = ctrl('water');
  const station = [ctrl('mop_wash'), x?.dryingMinutes ? ctrl('dry_stop') : ctrl('dry_start'), ctrl('dust')].filter(Boolean) as VacuumControl[];
  const stationIcon: Record<string, string> = { mop_wash: '🫧', dry_start: '🌬️', dry_stop: '🌬️', dust: '🗑️' };
  const toggles = ['dnd', 'carpet', 'resume', 'child_lock'].map(ctrl).filter(Boolean) as VacuumControl[];
  const resetFor = (id: string | null) => x?.controls.find((c) => c.id === id);
  const s = x?.stats;
  const stats = s ? ([
    s.lastArea !== null && [`${s.lastArea} m²`, `última limpeza${s.lastMinutes ? ` · ${s.lastMinutes} min` : ''}`],
    s.totalArea !== null && [`${s.totalArea} m²`, 'no total'],
    s.totalCount !== null && [String(s.totalCount), s.totalCount === 1 ? 'limpeza' : 'limpezas'],
  ].filter(Boolean) as [string, string][]) : [];
  const section = (title: string, body: ReactNode) => (
    <div style={card}>
      <p className={`${label} mb-3`}>{title}</p>
      {body}
    </div>
  );

  return (
    <Page>
      <div className="mx-auto flex max-w-xl flex-col gap-3 pt-3 pb-4">
        <div className="relative flex items-center justify-between">
          <button className="m-iconbox" style={{ width: 40, height: 40 }} onClick={() => navigate(-1)} aria-label="Voltar">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className={label}>Aspirador</p>
          <button className="m-iconbox" style={{ width: 40, height: 40 }} onClick={() => setMenu((m) => !m)} aria-label="Mais opções">
            <Ellipsis className="h-5 w-5" />
          </button>
          {menu && (
            <div className="absolute top-12 right-0 z-20 w-56 overflow-hidden rounded-2xl text-sm" style={{ background: 'var(--card-solid, #0b1a26)', border: '1px solid var(--line, rgba(255,255,255,.1))', boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>
              <button className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-white/5" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-4 w-4" /> {v.photo ? 'Trocar foto do robô' : 'Usar foto do meu robô'}
              </button>
              {v.photo && (
                <button
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-white/5"
                  onClick={async () => {
                    setMenu(false);
                    const err = await vacuumPhoto(entityId, null);
                    setMsg(err ? { text: err, ok: false } : { text: 'Voltei a usar o desenho.', ok: true });
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Remover foto
                </button>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void choosePhoto(e.target.files?.[0])} />
        </div>

        <div style={card} className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} aria-label="Trocar foto do robô" className="shrink-0">
            <RobotImage device={device} size={92} glow={cleaning ? 'var(--accent-1)' : v.phase === 'docked' ? '#34d399' : undefined} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              {device.name}
            </p>
            <p className="m-muted mt-1 mb-2 text-[13.5px] opacity-70">{device.available ? statusLine : 'Indisponível'}</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge[1]}`}>{badge[0]}</span>
          </div>
        </div>
        {!v.photo && (
          <button className="m-muted -mt-1 text-left text-xs opacity-60" onClick={() => fileRef.current?.click()}>
            Toque na imagem para usar uma foto do seu robô (de cima fica melhor).
          </button>
        )}

        <div style={{ ...card, padding: 12 }} className="flex gap-2">
          {cleaning ? (
            <button className="m-chip flex-[1.4] justify-center disabled:opacity-50" style={{ padding: 13, fontSize: 15 }} disabled={busy || !device.available} onClick={() => void run('pause')}>
              {v.can.pause ? <Pause className="h-4 w-4" /> : <Square className="h-4 w-4" />} {v.can.pause ? 'Pausar' : 'Parar'}
            </button>
          ) : (
            <button className="m-chip act flex-[1.4] justify-center disabled:opacity-50" style={{ padding: 13, fontSize: 15 }} disabled={busy || !device.available} onClick={() => void run('start')}>
              <Play className="h-4 w-4" /> {v.phase === 'paused' ? 'Continuar' : 'Iniciar limpeza'}
            </button>
          )}
          {v.can.returnHome && (
            <button className="m-chip flex-1 justify-center disabled:opacity-50" style={{ padding: 13 }} disabled={busy || !device.available || v.phase === 'docked'} onClick={() => void run('return_to_base')}>
              <House className="h-4 w-4" /> Base
            </button>
          )}
          {v.can.locate && (
            <button className="m-chip justify-center disabled:opacity-50" style={{ padding: '13px 15px' }} disabled={busy || !device.available} onClick={() => void run('locate').then((err) => !err && setMsg({ text: `${device.name} vai avisar onde está.`, ok: true }))} aria-label="Onde está" title="Onde está">
              <LocateFixed className="h-4 w-4" />
            </button>
          )}
        </div>

        {msg && <p className={`rounded-2xl px-4 py-2.5 text-sm ${msg.ok ? 'bg-emerald-400/10 text-emerald-100' : 'bg-rose-400/15 text-rose-100'}`}>{msg.text}</p>}

        {(suctionOpts.length > 0 || water) &&
          section(
            'Sucção',
            <>
              {suctionOpts.length > 0 && (
                <Chips options={suctionOpts} value={suction ? suction.value : v.fanSpeed} busy={busy || !!(suction && busyMap[`${entityId}:${suction.id}`])} onPick={(val) => void (suction ? extra(suction, val) : run('set_fan_speed', val))} />
              )}
              {water && (
                <>
                  <p className={`${label} mt-4 mb-3`}>Água do pano</p>
                  <Chips options={water.options ?? []} value={water.value} busy={!!busyMap[`${entityId}:${water.id}`]} onPick={(val) => void extra(water, val)} />
                </>
              )}
            </>,
          )}

        {station.length > 0 &&
          section(
            'Estação',
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${station.length}, minmax(0,1fr))` }}>
              {station.map((c) => (
                <button
                  key={c.id}
                  disabled={!!busyMap[`${entityId}:${c.id}`] || !device.available}
                  onClick={() => void extra(c, undefined, `${c.label}: comando enviado.`)}
                  className="m-chip flex-col justify-center gap-1 disabled:opacity-50"
                  style={{ padding: '12px 6px', borderRadius: 18, whiteSpace: 'normal', textAlign: 'center', fontSize: 12.5, lineHeight: 1.3 }}
                >
                  <span className="text-lg">{stationIcon[c.key]}</span>
                  {c.label}
                </button>
              ))}
            </div>,
          )}

        {x && x.consumables.length > 0 &&
          section(
            'Manutenção',
            <>
              {x.consumables.map((p) => {
                const reset = resetFor(p.resetId);
                return (
                  <button
                    key={p.key}
                    className="mb-3 block w-full text-left"
                    disabled={!reset}
                    onClick={() => reset && window.confirm(`Zerar a contagem de ${p.label.toLowerCase()}? Faça isso só depois de trocar ou limpar a peça.`) && void extra(reset, undefined, `${p.label}: contagem zerada.`)}
                  >
                    <span className="mb-1.5 flex justify-between text-[13.5px]">
                      <span>{p.label}</span>
                      <span className="m-muted opacity-70">
                        {p.percent}%{p.hoursLeft !== null ? ` · ${p.hoursLeft} h restantes` : ''}
                      </span>
                    </span>
                    <span className="block h-[7px] overflow-hidden rounded bg-white/10">
                      <span
                        className="block h-full rounded"
                        style={{ width: `${p.percent}%`, background: p.percent < 30 ? '#fb7185' : p.percent < 70 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,var(--accent-1),var(--accent-2))' }}
                      />
                    </span>
                  </button>
                );
              })}
              <p className="m-muted text-xs opacity-60">Trocou uma peça? Toque nela para zerar a contagem.</p>
            </>,
          )}

        {(stats.length > 0 || (x && x.schedules.length > 0)) &&
          section(
            'Limpezas',
            <>
              {stats.length > 0 && (
                <div className="grid gap-2 text-center" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0,1fr))` }}>
                  {stats.map(([val, l]) => (
                    <div key={l} className="rounded-2xl bg-white/5 px-1 py-3">
                      <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                        {val}
                      </p>
                      <p className="m-muted mt-1 text-[11.5px] opacity-70">{l}</p>
                    </div>
                  ))}
                </div>
              )}
              {x && x.schedules.length > 0 && <p className="m-muted mt-3 text-[12.5px] opacity-70">Agendamentos do app do fabricante: {x.schedules.join(' e ')}</p>}
            </>,
          )}

        {toggles.length > 0 && (
          <div style={{ ...card, paddingTop: 6, paddingBottom: 8 }}>
            <p className={`${label} mt-2.5 mb-1`}>Ajustes</p>
            {toggles.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 border-t border-white/10 py-2.5">
                <div>
                  <p className="text-sm">{c.label}</p>
                  {c.hint && <p className="m-muted mt-0.5 text-xs opacity-60">{c.hint}</p>}
                </div>
                <Switch label={c.label} on={c.value === true} disabled={!!busyMap[`${entityId}:${c.id}`]} onChange={(val) => void extra(c, val)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
