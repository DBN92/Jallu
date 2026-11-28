import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bed, Film, LayoutGrid, Moon, PowerOff, SendHorizontal, Sparkles, Sun, Video, X } from 'lucide-react';
import type { CameraDto, DeviceDto, TvPanelDto, TvSceneIcon } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useDevices } from '../stores/devices';
import { useCameras } from '../stores/cameras';
import { useLitter } from '../stores/litter';
import { usePeople } from '../stores/people';
import { useWasher } from '../stores/washer';
import { useLists } from '../stores/lists';
import { normalizeName } from '../lib/houseLinks';
import { NAV } from './Layout';
import { MessageList } from './Messages';
import { RecadoAlert, RecadosChips } from './Recados';
import { unseenRecados, useRecados } from '../stores/recados';
import { CameraThumb } from './CameraPlayer';
import { WeatherIcon } from './WeatherIcon';
import { hourOf } from './WasherCard';
import { RobotImage } from './RobotImage';
import { NewsCard } from './NewsCard';
import { fanLabel } from './VacuumCard';
import type { ModernHomeProps } from './ModernHome';

const SCENE_ICON: Record<TvSceneIcon, typeof Film> = { film: Film, moon: Moon, sun: Sun, off: PowerOff, bed: Bed, spark: Sparkles };
const DIAL_KEY = 'luna.painel.dial';
/** O anel do botão giratório começa em 210° (embaixo, à esquerda) e anda 300° no sentido do relógio */
const ARC_FROM = 210;
const ARC = 300;

const isToggle = (d: DeviceDto) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors' && d.domain !== 'vacuum';
const isDimmable = (d: DeviceDto) => d.category === 'lighting' && d.supportsBrightness && d.controllable && !d.hidden;
const isLightish = (d: DeviceDto) => d.category === 'lighting';

function readDial(): string | null {
  try {
    return localStorage.getItem(DIAL_KEY);
  } catch {
    return null;
  }
}
function saveDial(id: string) {
  try {
    localStorage.setItem(DIAL_KEY, id);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

function stateText(d: DeviceDto) {
  if (!d.available) return 'sem resposta';
  if (d.isOn && d.supportsBrightness && d.brightness !== null) return `${d.brightness}%`;
  if (isLightish(d)) return d.isOn ? 'acesa' : 'apagada';
  return d.isOn ? 'ligado' : 'desligado';
}

/** Câmera da babá: a que detecta choro, ou com “babá/bebê/Luiza” no nome */
function babyCam(list: CameraDto[]) {
  return list.find((c) => c.info?.some((i) => i.kind === 'cry')) ?? list.find((c) => /\b(baba|bebe|luiza|bercario|nenem)\b/.test(normalizeName(c.name))) ?? null;
}

/**
 * Tela inicial do tema Painel: um painel de vidro azul-noite ocupando a tela toda, como os teclados
 * de vidro das casas automatizadas. Botão giratório de brilho, interruptores dos favoritos, cenas e
 * uma telinha com hora, resumo da casa e a babá. Tudo sólido (sem desfoque): leve no tablet.
 */
export function PainelHome(p: ModernHomeProps) {
  const navigate = useNavigate();
  const devicesMap = useDevices((s) => s.devices);
  const openCameras = useCameras((s) => s.open);
  const boxes = useLitter((s) => s.boxes);
  const people = usePeople((s) => s.list);
  const washers = useWasher((s) => s.washers);
  const listItems = useLists((s) => s.items);
  const recados = useRecados((s) => s.list);
  const openRecados = useRecados((s) => s.open);
  const freshRecados = unseenRecados(recados).length;
  const [panel, setPanel] = useState<TvPanelDto | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [wxTab, setWxTab] = useState<'h' | 'd'>('h');
  const [dialId, setDialId] = useState<string | null>(readDial);

  // O menu de baixo sai da tela inicial (fica no botão de menu do painel)
  useEffect(() => {
    document.documentElement.classList.add('sky-home-on');
    return () => document.documentElement.classList.remove('sky-home-on');
  }, []);
  useEffect(() => {
    if (!useLitter.getState().boxes) void useLitter.getState().load();
    if (!usePeople.getState().list) void usePeople.getState().load();
    if (!useWasher.getState().washers) void useWasher.getState().load();
    if (!useLists.getState().items) void useLists.getState().load();
    api<TvPanelDto>('/api/tv/panel').then(setPanel, () => setPanel({ scenes: [], scenesDefault: true, favorites: [], favoritesAuto: true }));
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  };

  /* ---------- interruptores: os favoritos (os mesmos do painel da TV) ---------- */
  const tiles = useMemo(() => {
    const fav = (panel?.favorites ?? []).map((id) => devicesMap[id]).filter((d): d is DeviceDto => !!d && isToggle(d));
    const rest = Object.values(devicesMap)
      .filter((d) => isToggle(d) && !fav.includes(d))
      .sort((a, b) => Number(isLightish(b)) - Number(isLightish(a)) || a.name.localeCompare(b.name, 'pt-BR'));
    return [...fav, ...rest].slice(0, 12);
  }, [panel, devicesMap]);

  /* ---------- botão giratório: a luz escolhida, ou a primeira com brilho ---------- */
  const dialDev = (dialId && devicesMap[dialId] && isDimmable(devicesMap[dialId]!) ? devicesMap[dialId] : null) ?? tiles.find(isDimmable) ?? Object.values(devicesMap).find(isDimmable) ?? null;
  const devValue = dialDev ? (dialDev.isOn ? (dialDev.brightness ?? 100) : 0) : 0;
  const [dragValue, setDragValue] = useState<number | null>(null);
  // Depois de soltar, o botão fica onde o dedo deixou até a luz confirmar o brilho novo
  // (sem isso ele voltava ao valor antigo por um instante e só depois se alinhava)
  const [pending, setPending] = useState<{ id: string; v: number } | null>(null);
  const pend = pending && dialDev && pending.id === dialDev.entityId ? pending.v : null;
  const value = dragValue ?? pend ?? devValue;
  useEffect(() => {
    if (pend === null) return;
    if (Math.abs(devValue - pend) <= 3) {
      setPending(null);
      return;
    }
    const t = window.setTimeout(() => setPending(null), 5000);
    return () => window.clearTimeout(t);
  }, [pend, devValue]);
  const dialRef = useRef<HTMLDivElement>(null);
  /** Giro relativo, como um botão de verdade: o valor muda o quanto o dedo gira, onde quer que tenha tocado */
  const dialDrag = useRef<{ moved: boolean; x0: number; y0: number; last: number; v: number } | null>(null);
  const angleAt = (x: number, y: number) => {
    const r = dialRef.current!.getBoundingClientRect();
    return (Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) * 180) / Math.PI;
  };
  const dialDown = (e: RPointerEvent) => {
    if (!dialDev) return;
    dialDrag.current = { moved: false, x0: e.clientX, y0: e.clientY, last: angleAt(e.clientX, e.clientY), v: value };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const dialMove = (e: RPointerEvent) => {
    const d = dialDrag.current;
    if (!d) return;
    const a = angleAt(e.clientX, e.clientY);
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
      d.moved = true;
    }
    let delta = a - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = a;
    d.v = Math.max(0, Math.min(100, d.v + (delta / ARC) * 100));
    setDragValue(Math.round(d.v));
  };
  const dialUp = async () => {
    const d = dialDrag.current;
    dialDrag.current = null;
    if (!d || !dialDev) return;
    const v = Math.round(d.v);
    if (d.moved) setPending({ id: dialDev.entityId, v });
    setDragValue(null);
    try {
      if (!d.moved) {
        // Toque no meio: liga/desliga
        await useDevices.getState().toggle(dialDev);
      } else if (v <= 0) {
        if (dialDev.isOn) await useDevices.getState().toggle(dialDev);
      } else await useDevices.getState().brightness(dialDev.entityId, Math.max(1, v));
    } catch (err) {
      setPending(null);
      flash(errorMessage(err));
    }
  };

  /* ---------- toque liga/desliga; segurar uma luz com brilho a coloca no botão giratório ---------- */
  // O liga/desliga vem do “click”, que o navegador não dispara quando o dedo rolou a tela; o segurar
  // (meio segundo parado) é cancelado se o dedo andar mais de 10 px. Assim rolar não aciona nada.
  const hold = useRef<{ t: number; x: number; y: number } | null>(null);
  const skipClick = useRef<string | null>(null);
  const tileDown = (e: RPointerEvent, d: DeviceDto) => {
    skipClick.current = null;
    const h = { t: 0, x: e.clientX, y: e.clientY };
    h.t = window.setTimeout(() => {
      hold.current = null;
      skipClick.current = d.entityId; // o toque que soltar agora não liga/desliga
      if (isDimmable(d)) {
        setDialId(d.entityId);
        saveDial(d.entityId);
        flash(`O botão giratório agora controla: ${d.name}`);
      } else navigate('/casa');
    }, 550);
    hold.current = h;
  };
  const tileMove = (e: RPointerEvent) => {
    const h = hold.current;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) tileCancel();
  };
  const tileCancel = () => {
    if (hold.current) window.clearTimeout(hold.current.t);
    hold.current = null;
  };
  const tileClick = (d: DeviceDto) => {
    tileCancel();
    if (skipClick.current === d.entityId) {
      skipClick.current = null;
      return;
    }
    useDevices
      .getState()
      .toggle(d)
      .catch((err: unknown) => flash(errorMessage(err)));
  };

  /* ---------- cenas ---------- */
  const scenes = (panel?.scenes ?? []).slice(0, 4);
  const runScene = async (id: string, name: string) => {
    try {
      const r = await api<{ ok: boolean; count: number; failed: string[] }>(`/api/tv/scene/${id}`, { method: 'POST' });
      flash(r.failed?.length ? `${name}: ${r.failed.length} não responderam` : `${name} ✓`);
      void useDevices.getState().load(true);
    } catch (err) {
      flash(errorMessage(err));
    }
  };

  /* ---------- resumo da casa ---------- */
  const w = washers?.find((x) => x.available);
  const washerTotal = w?.startedAt && w.remainingMin !== null ? (Date.now() - Date.parse(w.startedAt)) / 60_000 + w.remainingMin : null;
  const washerPct = w?.running && washerTotal ? Math.max(3, Math.min(100, Math.round(100 * (1 - (w.remainingMin ?? 0) / washerTotal)))) : w?.status === 'end' ? 100 : 0;
  const box = boxes?.find((b) => b.available) ?? boxes?.[0];
  const catAlert = box?.cats.find((c) => c.alert);
  const home = (people ?? []).filter((x) => x.home);
  const cams = p.cameras ?? [];
  const baby = babyCam(cams);
  // Miniaturas de todas as câmeras (a da babá primeiro), até 6
  const shownCams = [...(baby ? [baby] : []), ...cams.filter((c) => c !== baby && c.available)].slice(0, 6);
  const babyTemp = baby?.info?.find((i) => i.kind === 'temperature')?.value ?? null;
  const crying = !!baby?.info?.some((i) => i.kind === 'cry' && i.active);
  const rain = p.weather?.hourly.slice(0, 12).find((h) => h.precipitationProbability >= 40);
  const lightsOn = Object.values(devicesMap).filter((d) => isLightish(d) && d.isOn && !d.hidden).length;
  const vacuum = Object.values(devicesMap).find((d) => d.domain === 'vacuum' && d.vacuum && !d.hidden) ?? null;
  // Interruptores só ocupam as fileiras que precisam; as câmeras preenchem o resto do meio
  const tileRows = Math.max(1, Math.ceil(tiles.length / 3));
  const camCols = shownCams.length <= 1 ? 1 : tileRows >= 4 ? Math.min(shownCams.length, 4) : shownCams.length <= 4 ? 2 : 3;
  const buy = (listItems ?? []).filter((i) => i.status === 'buy');
  // Próximas 5 horas (a partir da hora atual)
  const pad = (n: number) => String(n).padStart(2, '0');
  const hourKey = `${p.now.getFullYear()}-${pad(p.now.getMonth() + 1)}-${pad(p.now.getDate())}T${pad(p.now.getHours())}`;
  const days = (p.weather?.daily ?? []).slice(0, 4);
  const nextHours = (p.weather?.hourly ?? []).filter((h) => h.time.slice(0, 13) > hourKey).slice(0, 5);

  const chatOpen = p.hasChat || p.state !== 'idle';
  const listening = p.micActive || p.state === 'listening' || p.state === 'speaking';
  const angle = (value / 100) * ARC;

  return (
    <div className="pn-home">
      {/* Coluna 1: botão giratório, cenas, lava e seca, falar */}
      <section className="pn-col pn-left">
        <p className="pn-label">{dialDev ? dialDev.name : 'Brilho'}</p>
        <div
          ref={dialRef}
          className={`pn-dial ${value > 0 ? 'on' : ''} ${dragValue !== null || pend !== null ? 'drag' : ''}`}
          style={{ ['--a' as string]: `${angle}deg` }}
          onPointerDown={dialDown}
          onPointerMove={dialMove}
          onPointerUp={() => void dialUp()}
          onPointerCancel={() => {
            dialDrag.current = null;
            setDragValue(null);
          }}
          role="slider"
          aria-label={dialDev ? `Brilho: ${dialDev.name}` : 'Nenhuma luz com brilho'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          <div className="pn-knob">
            <b>{dialDev ? `${value}%` : '—'}</b>
            <span>{dialDev ? 'gire para ajustar' : 'sem luz com brilho'}</span>
          </div>
          {dialDev && <i className="pn-dot" style={{ transform: `rotate(${ARC_FROM + angle}deg)` }} />}
        </div>
        {scenes.length > 0 && (
          <div className="pn-scenes">
            {scenes.map((s) => {
              const Icon = SCENE_ICON[s.icon] ?? Sparkles;
              return (
                <button key={s.id} className="pn-scene" onClick={() => void runScene(s.id, s.name)} title={s.hint}>
                  <Icon className="h-4 w-4" />
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
        {vacuum?.vacuum && <PainelVacuum device={vacuum} onMsg={flash} />}
        {box && box.cats.length > 0 && (
          <div className="pn-card pn-cats">
            <button className="pn-label" onClick={() => navigate(`/caixa-de-areia/${box.id}`)}>
              Caixa de areia · hoje {box.todayCount} ›
            </button>
            <CatBelt cats={box.cats} />
            {catAlert?.alert && <p className="pn-warn">⚠ {catAlert.alert}</p>}
          </div>
        )}
        <div className="pn-spacer" />
        {w && (
          <button className="pn-card pn-washer" onClick={() => navigate(`/lava-e-seca/${w.id}`)}>
            <p className="pn-label">Lava e seca</p>
            <p className="pn-row">
              <span>{w.status === 'end' ? 'Roupa pronta ✓' : w.statusLabel}</span>
              <b>{w.running && w.endsAt ? hourOf(w.endsAt) : w.status === 'end' && w.lastDoneAt ? hourOf(w.lastDoneAt) : ''}</b>
            </p>
            <i className="pn-bar">
              <i style={{ transform: `scaleX(${washerPct / 100})` }} />
            </i>
          </button>
        )}
        <div className="pn-talk">
          <button className={`pn-mic ${listening ? 'live' : ''}`} onClick={p.onMic} aria-label={p.micActive ? 'Parar' : 'Falar com a Luna'}>
            {p.micIcon}
          </button>
          <span>{p.state === 'idle' ? 'Falar' : `Luna · ${p.stateLabel}`}</span>
          <button className={`pn-menu-btn pn-recado-btn ${freshRecados ? 'fresh' : ''}`} onClick={() => openRecados(freshRecados ? 'player' : 'recorder')} aria-label={freshRecados ? `Ver ${freshRecados} recado(s) novo(s)` : 'Deixar recado'} title="Deixar recado">
            <Video className="h-5 w-5" />
            {freshRecados > 0 && <i>{freshRecados}</i>}
          </button>
          <button className="pn-menu-btn" onClick={() => setMenu(true)} aria-label="Menu">
            <LayoutGrid className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* Coluna 2: interruptores */}
      <section className="pn-col pn-mid">
        {/* Recado novo: aviso grande em cima de tudo, até alguém assistir */}
        <div className="pn-recado-alert pn-wide-only">
          <RecadoAlert big />
        </div>
        <p className="pn-label">
          Luzes e aparelhos <span className="pn-hint">· segure uma luz para pôr no botão giratório</span>
        </p>
        <div className="pn-grid" style={{ gridTemplateRows: `repeat(${tileRows}, minmax(84px, ${shownCams.length ? 150 : 400}px))` }}>
          {tiles.map((d) => (
            <button
              key={d.entityId}
              className={`pn-key ${d.isOn ? 'on' : ''} ${d.available ? '' : 'off-line'} ${dialDev?.entityId === d.entityId ? 'dial' : ''}`}
              onPointerDown={(e) => tileDown(e, d)}
              onPointerMove={tileMove}
              onPointerUp={tileCancel}
              onPointerLeave={tileCancel}
              onPointerCancel={tileCancel}
              onClick={() => tileClick(d)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <b>{d.name}</b>
              <span>{stateText(d)}</span>
              <i />
            </button>
          ))}
          {!tiles.length && <p className="pn-empty">Nenhum aparelho ainda. Eles aparecem aqui quando o Home Assistant responder.</p>}
        </div>
        {shownCams.length > 0 && (
          <div className="pn-cams" style={{ gridTemplateColumns: `repeat(${camCols}, 1fr)` }}>
            {shownCams.map((c) => (
              <button key={c.entityId} className="pn-cam" onClick={() => openCameras([c.entityId, ...cams.filter((x) => x !== c).map((x) => x.entityId)])}>
                <CameraThumb camera={c} everyMs={20_000} className="pn-cam-img" />
                <span>
                  {c.name}
                  {c === baby && crying ? ' · choro!' : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Coluna 3: telinha */}
      <section className="pn-col pn-screen">
        <div className="pn-recado-alert pn-phone-only">
          <RecadoAlert />
        </div>
        <p className="pn-clock">{p.now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
        <p className="pn-sub">
          {p.weather ? (
            <>
              <WeatherIcon code={p.weather.current.weatherCode} isDay={p.weather.current.isDay} className="h-4 w-4" /> {Math.round(p.weather.current.temperature)}° ·{' '}
              {rain ? `chuva às ${Number(rain.time.slice(11, 13))}h` : p.weather.current.condition.toLowerCase()}
            </>
          ) : (
            p.now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
          )}
        </p>
        <div className="pn-rows">
          <p className="pn-row pn-row-luzes">
            <span>💡 Luzes acesas</span>
            <b>{lightsOn}</b>
          </p>
          {w && (
            <p className="pn-row pn-row-lava">
              <span>🧺 Lava e seca</span>
              <b>{w.running && w.endsAt ? hourOf(w.endsAt) : w.status === 'end' ? 'pronta' : w.power ? w.statusLabel.toLowerCase() : 'desligada'}</b>
            </p>
          )}
          {box && !box.cats.length && (
            <button className="pn-row" onClick={() => navigate(`/caixa-de-areia/${box.id}`)}>
              <span>🐱 Caixa de areia</span>
              <b className={catAlert ? 'warn' : ''}>
                {box.todayCount}
                {catAlert ? ` · ${catAlert.name} ⚠` : ''}
              </b>
            </button>
          )}
          {baby && babyTemp && (
            <p className="pn-row">
              <span>👶 {baby.name.replace(/^bab[aá]( eletr[oô]nica)?\s*/i, '') || 'Bebê'}</span>
              <b className={crying ? 'warn' : ''}>{crying ? 'choro!' : babyTemp}</b>
            </p>
          )}
          {people && (
            <p className="pn-row">
              <span>👥 Em casa</span>
              <b>{home.length}</b>
            </p>
          )}
          {buy.length > 0 && (
            <button className="pn-row pn-row-shop" onClick={() => navigate('/listas')}>
              <span>🛒 Compras</span>
              <b title={buy.map((i) => i.name).join(', ')}>{buy.length}</b>
            </button>
          )}
        </div>
        <div className="pn-recados">
          {/* recado novo já tem o aviso grande; aqui fica o acesso aos antigos */}
          {freshRecados === 0 && <RecadosChips />}
        </div>
        {(nextHours.length > 0 || days.length > 0) && (
          <div className="pn-card pn-hours">
            <div className="pn-wx-tabs">
              <button className={wxTab === 'h' ? 'on' : ''} onClick={() => setWxTab('h')}>
                Tempo · horas
              </button>
              <button className={wxTab === 'd' ? 'on' : ''} onClick={() => setWxTab('d')}>
                Dias
              </button>
            </div>
            <button className="pn-wx-row" onClick={() => navigate('/clima')}>
              {wxTab === 'h'
                ? nextHours.map((h) => {
                    const hr = Number(h.time.slice(11, 13));
                    return (
                      <span key={h.time}>
                        <small>{hr}h</small>
                        <WeatherIcon code={h.weatherCode} isDay={hr >= 6 && hr < 18} className="h-5 w-5" />
                        <b>{Math.round(h.temperature)}°</b>
                        <small className={h.precipitationProbability >= 40 ? 'rain' : ''}>{h.precipitationProbability}%</small>
                      </span>
                    );
                  })
                : days.map((d, k) => (
                    <span key={d.date}>
                      <small>{k === 0 ? 'hoje' : new Date(`${d.date}T12:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small>
                      <WeatherIcon code={d.weatherCode} isDay className="h-5 w-5" />
                      <b>
                        {Math.round(d.max)}° <em>{Math.round(d.min)}°</em>
                      </b>
                      <small className={d.precipitationProbability >= 40 ? 'rain' : ''}>{d.precipitationProbability}%</small>
                    </span>
                  ))}
            </button>
          </div>
        )}
        <NewsCard />
      </section>

      {/* Conversa com a Luna (só enquanto conversa) */}
      {(chatOpen || p.banner) && (
        <div className="pn-chat">
          {p.banner}
          {chatOpen && (
            <div className="pn-chat-card">
              <div className="mb-2 flex items-center justify-between">
                <p className="pn-label">Luna · {p.stateLabel}</p>
                {p.hasChat && (
                  <button onClick={p.onCloseChat} className="pn-x" aria-label="Fechar conversa">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="max-h-[34vh] min-h-0 overflow-y-auto">
                <MessageList messages={p.messages} interim={p.interim} compact />
              </div>
              <form onSubmit={p.onSubmit} className="pn-input">
                <input ref={p.inputRef} value={p.text} onChange={(e) => p.setText(e.target.value)} placeholder="Escreva para a Luna…" enterKeyHint="send" autoComplete="off" maxLength={4000} />
                {p.text.trim() && (
                  <button type="submit" aria-label="Enviar">
                    <SendHorizontal className="h-5 w-5" />
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      )}

      {/* Menu: as outras telas */}
      {menu && (
        <div className="pn-menu" onClick={() => setMenu(false)}>
          <nav onClick={(e) => e.stopPropagation()}>
            <form
              onSubmit={(e) => {
                setMenu(false);
                p.onSubmit(e);
              }}
              className="pn-input"
            >
              <input value={p.text} onChange={(e) => p.setText(e.target.value)} placeholder="Escreva para a Luna…" enterKeyHint="send" autoComplete="off" maxLength={4000} />
            </form>
            <div className="pn-links">
              {NAV.filter((n) => n.to !== '/').map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to}>
                  <Icon className="h-6 w-6" />
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}

      {toast && <div className="pn-toast">{toast}</div>}
    </div>
  );
}

/** Aspirador no Painel: foto/desenho do robô, nome, situação, bateria e um detalhe útil (última limpeza, erro, peça para trocar). */
function PainelVacuum({ device, onMsg }: { device: DeviceDto; onMsg: (m: string) => void }) {
  const navigate = useNavigate();
  const v = device.vacuum!;
  const busy = useDevices((s) => s.busy[device.entityId]);
  const x = v.extras;
  const charging = v.phase === 'docked' && v.battery !== null && v.battery < 100;
  const worn = x?.consumables.filter((c) => c.percent <= 10).sort((a, b) => a.percent - b.percent)[0];
  const detail = v.error
    ? { text: v.error, cls: 'err' }
    : v.phase === 'cleaning'
      ? { text: `limpando agora${v.fanSpeed ? ` · ${fanLabel(v.fanSpeed).toLowerCase()}` : ''}`, cls: 'on' }
      : v.phase === 'returning'
        ? { text: 'voltando para a base', cls: 'on' }
        : x?.dryingMinutes
          ? { text: `pano secando · ${x.dryingMinutes} min`, cls: '' }
          : worn
            ? { text: `trocar ${worn.label.toLowerCase()} (${worn.percent}%)`, cls: 'warn' }
            : x?.stats.lastArea
              ? { text: `última: ${Math.round(x.stats.lastArea)} m²${x.stats.lastMinutes ? ` · ${Math.round(x.stats.lastMinutes)} min` : ''}`, cls: '' }
              : charging
                ? { text: 'carregando', cls: '' }
                : null;
  const run = async (cmd: 'start' | 'pause' | 'return_to_base') => {
    const err = await useDevices.getState().vacuum(device.entityId, cmd);
    onMsg(err ?? (cmd === 'start' ? `${device.name} começou` : cmd === 'pause' ? `${device.name} pausado` : `${device.name} voltando para a base`));
  };
  const going = v.phase === 'cleaning' || v.phase === 'returning';
  return (
    <div className="pn-card pn-vac">
      <button className="pn-vac-main" onClick={() => navigate(`/aspirador/${device.entityId}`)}>
        <RobotImage device={device} size={40} />
        <span className="pn-vac-txt">
          <b>{device.name}</b>
          <small>
            {v.status}
            {v.battery !== null ? ` · ${charging ? '⚡' : ''}${v.battery}%` : ''}
          </small>
          {detail && <em className={detail.cls}>{detail.text}</em>}
        </span>
      </button>
      <span className="pn-vac-btns">
        {v.phase === 'cleaning' && v.can.pause && (
          <button disabled={busy} onClick={() => void run('pause')}>
            Pausar
          </button>
        )}
        <button disabled={busy} onClick={() => void run(going ? 'return_to_base' : 'start')}>
          {going ? 'Voltar' : v.phase === 'paused' ? 'Continuar' : 'Limpar'}
        </button>
      </span>
    </div>
  );
}

/**
 * Gatos numa esteira que anda sozinha, devagar e sem fim (a lista vai duplicada e a placa de vídeo
 * desliza; quando acaba a primeira volta, emenda sem pulo). Só anda se não couberem todos; tocar pausa.
 */
function CatBelt({ cats }: { cats: { id: string; name: string; todayVisits: number; alert: string | null; photo: number | null }[] }) {
  const vp = useRef<HTMLDivElement>(null);
  const half = useRef<HTMLDivElement>(null);
  const [dur, setDur] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const pauseT = useRef(0);
  useEffect(() => {
    const measure = () => {
      const v = vp.current;
      const h = half.current;
      if (!v || !h) return;
      const w = h.scrollWidth;
      setDur(w > v.clientWidth + 4 ? Math.max(14, w / 24) : null); // ~24 px por segundo
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (vp.current) ro.observe(vp.current);
    if (half.current) ro.observe(half.current);
    return () => ro.disconnect();
  }, [cats.length]);
  useEffect(() => () => window.clearTimeout(pauseT.current), []);
  const hold = () => {
    setPaused(true);
    window.clearTimeout(pauseT.current);
    pauseT.current = window.setTimeout(() => setPaused(false), 5000);
  };
  const items = cats.map((c) => (
    <span key={c.id} className={c.alert ? 'warn' : ''}>
      <i>{c.photo ? <img src={`/api/litter/cats/${c.id}/photo?v=${c.photo}`} alt="" /> : '🐱'}</i>
      <small>
        {c.name} <b>{c.todayVisits}</b>
      </small>
    </span>
  ));
  return (
    <div className={`pn-belt-vp ${dur ? 'moving' : ''}`} ref={vp} onPointerDown={hold}>
      <div className={`pn-belt ${dur ? 'run' : ''} ${paused ? 'paused' : ''}`} style={dur ? { ['--dur' as string]: `${dur}s` } : undefined}>
        <div className="pn-belt-half" ref={half}>
          {items}
        </div>
        {dur && (
          <div className="pn-belt-half" aria-hidden>
            {items}
          </div>
        )}
      </div>
    </div>
  );
}
