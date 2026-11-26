import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bed, Film, LayoutGrid, Moon, PowerOff, SendHorizontal, Sparkles, Sun, X } from 'lucide-react';
import type { CameraDto, DeviceDto, TvPanelDto, TvSceneIcon } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useDevices } from '../stores/devices';
import { useCameras } from '../stores/cameras';
import { useLitter } from '../stores/litter';
import { usePeople } from '../stores/people';
import { useWasher } from '../stores/washer';
import { normalizeName } from '../lib/houseLinks';
import { NAV } from './Layout';
import { MessageList } from './Messages';
import { RecadosChips } from './Recados';
import { CameraThumb } from './CameraPlayer';
import { WeatherIcon } from './WeatherIcon';
import { hourOf } from './WasherCard';
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
  const [panel, setPanel] = useState<TvPanelDto | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
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
  const value = dragValue ?? devValue;
  const dialRef = useRef<HTMLDivElement>(null);
  const dialDrag = useRef<{ moved: boolean; x0: number; y0: number } | null>(null);
  const valueAt = (x: number, y: number) => {
    const r = dialRef.current!.getBoundingClientRect();
    const a = ((Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) * 180) / Math.PI + 360) % 360;
    let rel = (a - ARC_FROM + 360) % 360;
    if (rel > ARC) rel = rel > ARC + (360 - ARC) / 2 ? 0 : ARC;
    return Math.round((rel / ARC) * 100);
  };
  const dialDown = (e: RPointerEvent) => {
    if (!dialDev) return;
    dialDrag.current = { moved: false, x0: e.clientX, y0: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const dialMove = (e: RPointerEvent) => {
    const d = dialDrag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    d.moved = true;
    setDragValue(valueAt(e.clientX, e.clientY));
  };
  const dialUp = async () => {
    const d = dialDrag.current;
    dialDrag.current = null;
    if (!d || !dialDev) return;
    try {
      if (!d.moved) {
        // Toque no meio: liga/desliga
        await useDevices.getState().toggle(dialDev);
      } else {
        const v = dragValue ?? devValue;
        if (v <= 0) {
          if (dialDev.isOn) await useDevices.getState().toggle(dialDev);
        } else await useDevices.getState().brightness(dialDev.entityId, Math.max(1, v));
      }
    } catch (err) {
      flash(errorMessage(err));
    } finally {
      setDragValue(null);
    }
  };

  /* ---------- toque liga/desliga; segurar uma luz com brilho a coloca no botão giratório ---------- */
  const hold = useRef<{ t: number; fired: boolean } | null>(null);
  const tileDown = (d: DeviceDto) => {
    const h = { t: 0, fired: false };
    h.t = window.setTimeout(() => {
      h.fired = true;
      if (isDimmable(d)) {
        setDialId(d.entityId);
        saveDial(d.entityId);
        flash(`O botão giratório agora controla: ${d.name}`);
      } else navigate('/casa');
    }, 550);
    hold.current = h;
  };
  const tileUp = (d: DeviceDto) => {
    const h = hold.current;
    hold.current = null;
    if (!h) return;
    window.clearTimeout(h.t);
    if (h.fired) return;
    useDevices
      .getState()
      .toggle(d)
      .catch((err: unknown) => flash(errorMessage(err)));
  };
  const tileCancel = () => {
    if (hold.current) window.clearTimeout(hold.current.t);
    hold.current = null;
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
  const shownCam = baby ?? cams.find((c) => c.available) ?? null;
  const babyTemp = baby?.info?.find((i) => i.kind === 'temperature')?.value ?? null;
  const crying = !!baby?.info?.some((i) => i.kind === 'cry' && i.active);
  const rain = p.weather?.hourly.slice(0, 12).find((h) => h.precipitationProbability >= 40);
  const lightsOn = Object.values(devicesMap).filter((d) => isLightish(d) && d.isOn && !d.hidden).length;

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
          className={`pn-dial ${dialDev?.isOn || dragValue ? 'on' : ''} ${dragValue !== null ? 'drag' : ''}`}
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
          <span>{p.state === 'idle' ? 'Fale com a Luna' : `Luna · ${p.stateLabel}`}</span>
          <button className="pn-menu-btn" onClick={() => setMenu(true)} aria-label="Menu">
            <LayoutGrid className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* Coluna 2: interruptores */}
      <section className="pn-col pn-mid">
        <p className="pn-label">
          Luzes e aparelhos <span className="pn-hint">· segure uma luz para pôr no botão giratório</span>
        </p>
        <div className="pn-grid">
          {tiles.map((d) => (
            <button
              key={d.entityId}
              className={`pn-key ${d.isOn ? 'on' : ''} ${d.available ? '' : 'off-line'} ${dialDev?.entityId === d.entityId ? 'dial' : ''}`}
              onPointerDown={() => tileDown(d)}
              onPointerUp={() => tileUp(d)}
              onPointerLeave={tileCancel}
              onPointerCancel={tileCancel}
              onContextMenu={(e) => e.preventDefault()}
            >
              <b>{d.name}</b>
              <span>{stateText(d)}</span>
              <i />
            </button>
          ))}
          {!tiles.length && <p className="pn-empty">Nenhum aparelho ainda. Eles aparecem aqui quando o Home Assistant responder.</p>}
        </div>
      </section>

      {/* Coluna 3: telinha */}
      <section className="pn-col pn-screen">
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
          <p className="pn-row">
            <span>💡 Luzes acesas</span>
            <b>{lightsOn}</b>
          </p>
          {w && (
            <p className="pn-row">
              <span>🧺 Lava e seca</span>
              <b>{w.running && w.endsAt ? hourOf(w.endsAt) : w.status === 'end' ? 'pronta' : w.power ? w.statusLabel.toLowerCase() : 'desligada'}</b>
            </p>
          )}
          {box && (
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
        </div>
        <div className="pn-recados">
          <RecadosChips />
        </div>
        {shownCam && (
          <button className="pn-cam" onClick={() => openCameras([shownCam.entityId, ...cams.filter((c) => c !== shownCam).map((c) => c.entityId)])}>
            <CameraThumb camera={shownCam} everyMs={15_000} className="pn-cam-img" />
            <span>
              {shownCam.name}
              {baby === shownCam ? (crying ? ' · choro detectado' : ' · tudo calmo') : ''}
            </span>
          </button>
        )}
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
