import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bot, Cat, Cctv, ChevronRight, Lightbulb, Moon, PowerOff, SendHorizontal, Sun, X } from 'lucide-react';
import type { DeviceDto, TvPanelDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useDevices } from '../stores/devices';
import { useCameras } from '../stores/cameras';
import { useLitter } from '../stores/litter';
import { usePeople } from '../stores/people';
import { skyPhase } from '../lib/sky';
import { normalizeName } from '../lib/houseLinks';
import { NAV } from './Layout';
import { MessageList } from './Messages';
import { RecadosChips } from './Recados';
import { WeatherIcon } from './WeatherIcon';
import { DeviceTile } from './DeviceTile';
import { GarageCard } from './GarageCard';
import { VacuumCard } from './VacuumCard';
import { LitterCard } from './LitterCard';
import { WasherCard } from './WasherCard';
import { SkyTipChip } from './SkyBackdrop';
import type { ModernHomeProps } from './ModernHome';

const isToggle = (d: DeviceDto) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors' && d.domain !== 'vacuum';
const isLight = (d: DeviceDto) => d.category === 'lighting' && d.controllable && !d.hidden && d.available;
const round = Math.round;

/**
 * Tela inicial do tema Céu (minimalista): o céu em destaque, relógio e tempo grandes, cinco botões
 * redondos de vidro e o resto numa gaveta que sobe ao arrastar (aparelhos, casa e o menu).
 */
export function SkyHome(p: ModernHomeProps) {
  const navigate = useNavigate();
  const devicesMap = useDevices((s) => s.devices);
  const openCameras = useCameras((s) => s.open);
  const boxes = useLitter((s) => s.boxes);
  const people = usePeople((s) => s.list);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmClean, setConfirmClean] = useState(false);
  const [favorites, setFavorites] = useState<string[] | null>(null);

  // O menu de baixo sai da tela inicial (fica dentro da gaveta)
  useEffect(() => {
    document.documentElement.classList.add('sky-home-on');
    return () => document.documentElement.classList.remove('sky-home-on');
  }, []);
  // Céu parado enquanto a gaveta se mexe ou está aberta: o tablet não precisa animar nuvens/chuva
  // (e refazer o vidro por cima delas) a cada quadro junto com a gaveta. Volta a andar depois de fechar.
  const busyT = useRef(0);
  const skyBusy = (on: boolean) => {
    window.clearTimeout(busyT.current);
    // Só na camada do céu (marcar o <html> recalcularia o estilo da página inteira e dava um tranco)
    const sky = document.querySelector('.sky-bg');
    if (!sky) return;
    if (on) sky.classList.add('busy');
    else busyT.current = window.setTimeout(() => sky.classList.remove('busy'), 500);
  };
  useEffect(
    () => () => {
      window.clearTimeout(busyT.current);
      document.querySelector('.sky-bg')?.classList.remove('busy');
    },
    [],
  );
  useEffect(() => {
    if (!useLitter.getState().boxes) void useLitter.getState().load();
    if (!usePeople.getState().list) void usePeople.getState().load();
    api<TvPanelDto>('/api/tv/panel').then((r) => setFavorites(r.favorites), () => setFavorites([]));
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  };

  const devices = Object.values(devicesMap);
  const lights = devices.filter(isLight);
  const lightsOn = lights.filter((d) => d.isOn).length;
  const sala = lights.filter((d) => normalizeName(d.name).includes('sala'));
  const fav = useMemo(() => {
    const list = (favorites ?? []).map((id) => devicesMap[id]).filter((d): d is DeviceDto => !!d && isToggle(d));
    return list.length ? list : Object.values(devicesMap).filter(isToggle).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).slice(0, 8);
  }, [favorites, devicesMap]);
  const home = (people ?? []).filter((x) => x.home);
  const box = boxes?.find((b) => b.available);
  const vacuum = devices.find((d) => d.domain === 'vacuum' && d.vacuum && !d.hidden);
  const camsOnline = (p.cameras ?? []).filter((c) => c.available).length;
  const phase = skyPhase(p.now, p.weather);
  const rain = p.weather?.hourly.slice(0, 12).find((h) => h.precipitationProbability >= 40);

  /* ---------- cena do momento ---------- */
  const scene =
    phase === 'noite'
      ? { icon: Moon, label: 'Boa noite', sub: 'apaga tudo', run: () => api('/api/tv/scene/boa-noite', { method: 'POST' }).then(() => 'Boa noite! Luzes apagadas.') }
      : phase === 'tarde'
        ? {
            icon: Lightbulb,
            label: 'Acender sala',
            sub: 'em 70%',
            run: async () => {
              for (const d of sala) {
                if (d.supportsBrightness) await useDevices.getState().brightness(d.entityId, 70);
                else if (!d.isOn) await useDevices.getState().toggle(d);
              }
              return sala.length ? 'Sala acesa.' : 'Nenhuma luz com “sala” no nome.';
            },
          }
        : lightsOn > 0
          ? { icon: PowerOff, label: 'Apagar tudo', sub: `${lightsOn} ${lightsOn === 1 ? 'acesa' : 'acesas'}`, run: () => api('/api/tv/scene/apagar', { method: 'POST' }).then(() => 'Luzes apagadas.') }
          : { icon: Sun, label: 'Acender tudo', sub: 'todas as luzes', run: () => api('/api/tv/scene/acender', { method: 'POST' }).then(() => 'Luzes acesas.') };
  const runScene = async () => {
    try {
      flash(await scene.run());
      void useDevices.getState().load(true);
    } catch (err) {
      flash(errorMessage(err));
    }
  };

  /* ---------- caixa de areia (dois toques) ou aspirador ---------- */
  const tapBox = async () => {
    if (!box) return;
    if (!confirmClean) {
      setConfirmClean(true);
      window.setTimeout(() => setConfirmClean(false), 5000);
      return;
    }
    setConfirmClean(false);
    flash((await useLitter.getState().clean(box.id)) ?? 'Limpando a caixa de areia…');
  };
  const tapVacuum = async () => {
    if (!vacuum?.vacuum) return;
    const going = vacuum.vacuum.phase === 'cleaning' || vacuum.vacuum.phase === 'returning';
    const err = await useDevices.getState().vacuum(vacuum.entityId, going ? 'return_to_base' : 'start');
    flash(err ?? (going ? 'Aspirador voltando para a base' : 'Aspirador começou'));
  };

  /* ---------- gaveta: arrastar ou tocar na alça ----------
   * O arraste mexe direto no estilo da gaveta (sem redesenhar a tela pelo React a cada movimento),
   * um quadro por vez; ao soltar, decide pela velocidade (um “peteleco” já abre/fecha) ou pela posição. */
  const sheetRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; base: number; max: number; pos: number; lastY: number; lastT: number; v: number; moved: boolean; raf: number } | null>(null);
  /** Abre/fecha: a animação começa na hora (classe direto na gaveta) e o React só atualiza depois
   * que ela termina — redesenhar a tela inicial bem no começo da animação era o tranco ao soltar. */
  const sheetT = useRef(0);
  const animateSheet = (open: boolean) => {
    window.clearTimeout(sheetT.current);
    sheetRef.current?.classList.toggle('open', open);
    dimRef.current?.classList.toggle('on', open);
    skyBusy(open);
    sheetT.current = window.setTimeout(() => setSheet(open), 480);
  };
  useEffect(() => () => window.clearTimeout(sheetT.current), []);
  const paint = () => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    d.raf = 0;
    el.style.transform = `translate3d(0, ${d.pos}px, 0)`;
    if (dimRef.current) dimRef.current.style.opacity = String(1 - d.pos / d.max);
  };
  const onDown = (e: RPointerEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    const base = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    drag.current = { y0: e.clientY, base, max: Math.max(1, el.offsetHeight - 72), pos: base, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false, raf: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) > 4) {
      d.moved = true;
      skyBusy(true);
      el.style.transition = 'none';
      if (dimRef.current) {
        dimRef.current.style.transition = 'none';
        dimRef.current.style.visibility = 'visible';
      }
    }
    if (!d.moved) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = d.v * 0.6 + ((e.clientY - d.lastY) / dt) * 0.4;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.pos = Math.min(d.max, Math.max(0, d.base + dy));
    if (!d.raf) d.raf = requestAnimationFrame(paint);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    if (!d.moved) {
      animateSheet(!sheetRef.current?.classList.contains('open'));
      return;
    }
    const open = d.v < -0.3 ? true : d.v > 0.3 ? false : d.pos < d.max / 2;
    const el = sheetRef.current;
    if (el) {
      el.style.transition = '';
      el.style.transform = '';
    }
    if (dimRef.current) {
      dimRef.current.style.transition = '';
      dimRef.current.style.opacity = '';
      dimRef.current.style.visibility = '';
    }
    animateSheet(open);
  };

  // Conteúdo da gaveta não muda ao abrir/fechar: não é refeito no meio da animação
  const sheetBody = useMemo(
    () => (
        <div className="sh-body m-scroll">
          <form onSubmit={p.onSubmit} className="m-input mb-4">
            <input ref={p.inputRef} value={p.text} onChange={(e) => p.setText(e.target.value)} placeholder="Escreva para a Luna…" enterKeyHint="send" autoComplete="off" maxLength={4000} />
            {p.text.trim() && (
              <button type="submit" aria-label="Enviar">
                <SendHorizontal className="h-5 w-5" />
              </button>
            )}
          </form>
          <div className="sh-sec">
            <span>Luzes e aparelhos</span>
            <button onClick={() => navigate('/casa')}>
              ver todos <ChevronRight className="inline h-4 w-4" />
            </button>
          </div>
          <div className="sh-tiles">
            {fav.map((d, i) => (
              <DeviceTile key={d.entityId} device={d} index={i} />
            ))}
          </div>
          <div className="sh-sec">
            <span>Casa</span>
          </div>
          <div className="sh-cards">
            <GarageCard />
            <VacuumCard />
            <LitterCard />
            <WasherCard />
          </div>
          <nav className="sh-nav">
            {NAV.filter((n) => n.to !== '/').map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to}>
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
    ),
    [fav, p.text, p.onSubmit, p.setText, p.inputRef, navigate],
  );

  const chatOpen = p.hasChat || p.state !== 'idle';
  const listening = p.micActive || p.state === 'listening' || p.state === 'speaking';

  const btn = (key: string, Icon: typeof Moon, label: string, sub: string | null, onClick: () => void, on = false) => (
    <button key={key} className={`sh-act ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="sh-b">
        <Icon className="h-7 w-7" />
      </span>
      <span className="sh-l">{label}</span>
      {sub && <small>{sub}</small>}
    </button>
  );

  return (
    <div className="sky-home">
      {/* Topo: saudação, relógio, tempo e dica */}
      <div className="sh-hero">
        <p className="sh-hi">
          {p.greeting}
          {p.userName ? `, ${p.userName}` : ''}
        </p>
        <p className="sh-clock">{p.now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
        {p.weather && (
          <p className="sh-wx">
            <WeatherIcon code={p.weather.current.weatherCode} isDay={p.weather.current.isDay} className="h-7 w-7" />
            <b>{round(p.weather.current.temperature)}°</b>
            <span>
              {p.weather.current.condition}
              {rain ? ` · chuva ${rain.precipitationProbability}% às ${Number(rain.time.slice(11, 13))}h` : p.weather.daily[0] ? ` · máx ${round(p.weather.daily[0].max)}°` : ''}
            </span>
          </p>
        )}
        <p className="sh-date">{p.now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        <div className="sh-tip">
          <SkyTipChip now={p.now} weather={p.weather} />
        </div>
      </div>

      {/* Canto: recado novo e quem está em casa */}
      <div className="sh-corner">
        <RecadosChips />
        {people && (
          <span className="m-chip sh-people">
            <span className="sh-av">
              {home.slice(0, 3).map((x) => (
                <span key={x.id}>{x.name.slice(0, 1).toUpperCase()}</span>
              ))}
            </span>
            {home.length ? 'em casa' : 'ninguém em casa'}
          </span>
        )}
      </div>

      {/* Conversa com a Luna (só enquanto conversa) */}
      {(chatOpen || p.banner) && (
        <div className="sh-chat">
          {p.banner}
          {chatOpen && (
            <div className="m-card sh-chat-card">
              <div className="mb-2 flex items-center justify-between">
                <p className="m-label">Luna · {p.stateLabel}</p>
                {p.hasChat && (
                  <button onClick={p.onCloseChat} className="m-iconbox" style={{ width: 32, height: 32, borderRadius: 10 }} aria-label="Fechar conversa">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="max-h-[30vh] min-h-0 overflow-y-auto">
                <MessageList messages={p.messages} interim={p.interim} compact />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cinco botões */}
      <div className="sh-acts">
        {btn('luzes', Lightbulb, 'Luzes', `${lightsOn} ${lightsOn === 1 ? 'acesa' : 'acesas'}`, () => animateSheet(true), lightsOn > 0)}
        {btn('cams', Cctv, 'Câmeras', p.cameras ? `${camsOnline} online` : null, () => p.cameras?.length && openCameras(p.cameras.map((c) => c.entityId)))}
        <button className={`sh-act sh-mic ${listening ? 'live' : ''}`} onClick={p.onMic} aria-label={p.micActive ? 'Parar' : 'Falar com a Luna'}>
          <span className="sh-b">{p.micIcon}</span>
          <span className="sh-l">Luna</span>
          <small>{p.stateLabel}</small>
        </button>
        {btn('cena', scene.icon, scene.label, scene.sub, () => void runScene())}
        {box
          ? btn('caixa', Cat, confirmClean ? 'Toque de novo' : 'Caixa', confirmClean ? 'para limpar' : box.statusLabel.toLowerCase(), () => void tapBox(), confirmClean)
          : vacuum
            ? btn('robo', Bot, 'Aspirador', vacuum.vacuum?.status ?? null, () => void tapVacuum())
            : null}
      </div>

      {toast && <div className="sh-toast">{toast}</div>}

      {/* Gaveta */}
      <div ref={dimRef} className={`sh-dim ${sheet ? 'on' : ''}`} onClick={() => animateSheet(false)} />
      <div ref={sheetRef} className={`sh-sheet m-card ${sheet ? 'open' : ''}`}>
        <div className="sh-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="button" aria-label={sheet ? 'Fechar gaveta' : 'Abrir gaveta: casa, aparelhos e menu'}>
          <i />
          <span>Arraste para cima: casa, aparelhos e menu</span>
        </div>
        {sheetBody}
      </div>
    </div>
  );
}
