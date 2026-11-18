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

  /* ---------- gaveta: arrastar ou tocar na alça ---------- */
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const [dy, setDy] = useState(0);
  const onDown = (e: RPointerEvent) => {
    drag.current = { y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current) return;
    const d = e.clientY - drag.current.y;
    if (Math.abs(d) > 6) drag.current.moved = true;
    setDy(sheet ? Math.max(0, d) : Math.min(0, d));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) setSheet((s) => !s);
    else if (dy < -50) setSheet(true);
    else if (dy > 50) setSheet(false);
    setDy(0);
  };

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
        {btn('luzes', Lightbulb, 'Luzes', `${lightsOn} ${lightsOn === 1 ? 'acesa' : 'acesas'}`, () => setSheet(true), lightsOn > 0)}
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
      {sheet && <div className="sh-dim" onClick={() => setSheet(false)} />}
      <div className={`sh-sheet m-card ${sheet ? 'open' : ''}`} style={dy ? { transform: `translateY(calc(var(--sh-y) + ${dy}px))`, transition: 'none' } : undefined}>
        <div className="sh-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="button" aria-label={sheet ? 'Fechar gaveta' : 'Abrir gaveta: casa, aparelhos e menu'}>
          <i />
          {!sheet && <span>Arraste para cima: casa, aparelhos e menu</span>}
        </div>
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
      </div>
    </div>
  );
}
