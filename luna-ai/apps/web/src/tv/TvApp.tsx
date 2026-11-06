import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cctv, CloudSun, Fan, Home, Lightbulb, Moon, Plug, Power, Smartphone, Sun, Thermometer } from 'lucide-react';
import type { CameraDto, DeviceDto, PtzAction, WeatherDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useDevices } from '../stores/devices';
import { useCameras } from '../stores/cameras';
import { useAssistant } from '../stores/assistant';
import { useSettings } from '../stores/settings';
import { useTv } from '../stores/tv';
import { useClock, useWeather } from '../hooks/useWeather';
import { useHealth } from '../hooks/useHudData';
import { acquireScreen, releaseScreen } from '../lib/wakeLock';
import { nextFocus, tvKey, type TvKey } from '../lib/tv';
import { STATE_LABEL } from '../lib/text';
import { LunaOrb } from '../components/LunaOrb';
import { CameraPlayer, CameraThumb } from '../components/CameraPlayer';
import { WeatherIcon } from '../components/WeatherIcon';
import './tv.css';

type Tab = 'inicio' | 'casa' | 'cameras' | 'clima';
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'casa', label: 'Casa', icon: Lightbulb },
  { id: 'cameras', label: 'Câmeras', icon: Cctv },
  { id: 'clima', label: 'Clima', icon: CloudSun },
];
/** Sem usar o controle por este tempo, entra o protetor de tela. */
export const SAVER_MS = 3 * 60_000;
const REPLY_MS = 15_000;
const round = Math.round;

const isToggle = (d: DeviceDto) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors';
const deviceIcon = (d: DeviceDto) =>
  d.category === 'lighting' ? Lightbulb : d.category === 'outlets' ? Plug : d.category === 'climate' ? (d.entityId.startsWith('fan.') ? Fan : Thermometer) : Power;
const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: Date) => `${d.toLocaleDateString('pt-BR', { weekday: 'long' })} · ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}`;

/** Próxima hora com chance de chuva ≥ 40% (nas próximas 12 h). */
function nextRain(w: WeatherDto | null) {
  const h = w?.hourly.slice(0, 12).find((x) => x.precipitationProbability >= 40);
  return h ? { hour: `${Number(h.time.slice(11, 13))}h`, prob: h.precipitationProbability } : null;
}

/** Cenário 3D (cidade, piso, moldura) — desenhado uma vez. */
function TvScene() {
  const skyline = useMemo(() => {
    let x = 0;
    let s = '';
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    while (x < 1200) {
      const bw = 30 + rnd() * 60;
      const bh = 60 + rnd() * 220;
      s += `<rect x="${x}" y="${300 - bh}" width="${bw}" height="${bh}" fill="#06223a"/>`;
      for (let k = 0; k < 6; k++) s += `<rect x="${x + 5 + rnd() * (bw - 10)}" y="${300 - bh + 10 + rnd() * (bh - 20)}" width="3" height="2" fill="#5fd8ff" opacity=".7"/>`;
      x += bw + 4;
    }
    return s;
  }, []);
  return (
    <>
      <svg className="tv-sky" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: skyline }} />
      <div className="tv-floor" aria-hidden="true" />
      <svg className="tv-frame" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="#00e5ff" strokeWidth="2" opacity=".85">
          <path d="M10 60 V20 L30 6 H330 M670 6 H970 L990 20 V60" vectorEffect="non-scaling-stroke" />
          <path d="M10 540 V580 L30 594 H300 M700 594 H970 L990 580 V540" vectorEffect="non-scaling-stroke" />
          <path d="M4 150 V450 M996 150 V450" opacity=".45" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
    </>
  );
}

function Hint({ items }: { items: [string, string][] }) {
  return (
    <div className="tv-hint">
      {items.map(([k, t]) => (
        <span key={t}>
          <span className="tv-key">{k}</span>
          {t}
        </span>
      ))}
    </div>
  );
}

function Bar({ label, value, text, warn }: { label: string; value: number; text: string; warn?: boolean }) {
  return (
    <div className="tv-bar">
      <span>{label}</span>
      <div className="tr">
        <div className={`fl ${warn ? 'warn' : ''}`} style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
      </div>
      <span>{text}</span>
    </div>
  );
}

/** Palco 1920×1080 escalado para caber na tela (a TV pode informar 960×540 ou 1920×1080). */
function useStageScale() {
  const [box, setBox] = useState({ scale: 1, x: 0, y: 0 });
  useEffect(() => {
    const fit = () => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setBox({ scale, x: (window.innerWidth - 1920 * scale) / 2, y: (window.innerHeight - 1080 * scale) / 2 });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return box;
}

export default function TvApp() {
  const stage = useStageScale();
  const stageRef = useRef<HTMLDivElement>(null);
  const now = useClock();
  const health = useHealth();
  const { data: weather } = useWeather('home');
  const devicesMap = useDevices((s) => s.devices);
  const busy = useDevices((s) => s.busy);
  const haConnected = useDevices((s) => s.haConnected);
  const server = useAssistant((s) => s.serverConnected);
  const { cameras, load: loadCameras } = useCameras();
  const remoteState = useTv((s) => s.remoteState);
  const lastReply = useTv((s) => s.lastReply);
  const setTvMode = useSettings((s) => s.setTvMode);

  const [tab, setTab] = useState<Tab>('inicio');
  const [focus, setFocus] = useState('');
  const [camView, setCamView] = useState<{ ids: string[]; index: number } | null>(null);
  const [saver, setSaver] = useState(false);
  const [reply, setReply] = useState<typeof lastReply>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastInput = useRef(Date.now());

  // Tela sempre acesa enquanto o modo TV estiver aberto
  useEffect(() => {
    void acquireScreen();
    return () => releaseScreen();
  }, []);

  useEffect(() => {
    if (!cameras) void loadCameras();
  }, [cameras, loadCameras]);

  const devices = useMemo(() => Object.values(devicesMap).filter((d) => !d.hidden), [devicesMap]);
  const toggles = useMemo(
    () => devices.filter(isToggle).sort((a, b) => Number(b.category === 'lighting') - Number(a.category === 'lighting') || a.name.localeCompare(b.name, 'pt-BR')), // ordem fixa (o foco não muda de aparelho ao ligar)
    [devices],
  );
  const sensors = useMemo(() => devices.filter((d) => d.category === 'sensors' && d.available).slice(0, 12), [devices]);
  const lights = devices.filter((d) => d.category === 'lighting' && d.controllable);
  const lightsOn = lights.filter((d) => d.isOn).length;
  const outletsOn = devices.filter((d) => (d.category === 'outlets' || d.category === 'switches') && d.isOn).length;
  const camList = cameras ?? [];
  const rain = nextRain(weather);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const toggle = useCallback(
    async (d: DeviceDto) => {
      await useDevices.getState().toggle(d);
      const err = useDevices.getState().error;
      if (err) flash(err);
    },
    [flash],
  );

  const allLights = useCallback(
    async (on: boolean) => {
      const targets = Object.values(useDevices.getState().devices).filter((d) => d.category === 'lighting' && d.controllable && !d.hidden && d.isOn === !on);
      await Promise.all(targets.map((d) => useDevices.getState().toggle(d)));
      const err = useDevices.getState().error;
      if (err) flash(err);
    },
    [flash],
  );

  const openCamera = useCallback((ids: string[], index = 0) => {
    if (ids.length) setCamView({ ids, index });
  }, []);

  // Resposta pedida pelo celular: mostra na TV; se for “mostrar câmera”, abre aqui também
  useEffect(() => {
    if (!lastReply) return;
    setSaver(false);
    lastInput.current = Date.now();
    setReply(lastReply);
    if (lastReply.cameraIds.length) openCamera(lastReply.cameraIds);
    const t = window.setTimeout(() => setReply(null), REPLY_MS);
    return () => clearTimeout(t);
  }, [lastReply, openCamera]);

  // Protetor de tela após 3 min sem usar o controle (não cobre a câmera aberta)
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!camView && Date.now() - lastInput.current > SAVER_MS) setSaver(true);
    }, 5000);
    return () => clearInterval(t);
  }, [camView]);

  /* ---------- foco ---------- */
  const items = () => Array.from(stageRef.current?.querySelectorAll<HTMLElement>('[data-tv]') ?? []);
  const findEl = (id: string) => items().find((e) => e.dataset.tv === id) ?? null;

  // Garante que sempre haja um item focado (troca de aba, lista que mudou…)
  useEffect(() => {
    if (camView || saver) return;
    if (focus && findEl(focus)) return;
    const first = stageRef.current?.querySelector<HTMLElement>('[data-tv-first]') ?? stageRef.current?.querySelector<HTMLElement>('.tv-main [data-tv]');
    if (first?.dataset.tv) setFocus(first.dataset.tv);
  });

  useEffect(() => {
    findEl(focus)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTab = (t: Tab) => {
    setTab(t);
    setFocus(`tab:${t}`);
  };

  /* ---------- voltar (tecla ↩ e o “voltar” do navegador da TV) ---------- */
  const deep = !!camView || tab !== 'inicio' || !!reply;
  const back = useRef<() => void>(() => undefined);
  back.current = () => {
    if (camView) setCamView(null);
    else if (reply) setReply(null);
    else if (tab !== 'inicio') goTab('inicio');
  };
  useEffect(() => {
    if (deep && !history.state?.lunaTv) history.pushState({ lunaTv: 1 }, '');
  });
  useEffect(() => {
    const onPop = () => back.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /* ---------- câmera em tela cheia ---------- */
  const cam: CameraDto | undefined = camView ? camList.find((c) => c.entityId === camView.ids[camView.index % camView.ids.length]) : undefined;
  const [ptzDir, setPtzDir] = useState<PtzAction | null>(null);
  const ptzHeld = useRef(false);
  const ptz = useCallback(
    (action: PtzAction) => {
      if (!cam) return;
      void api(`/api/cameras/${cam.entityId}/ptz`, { body: { action } }).catch((e) => flash(errorMessage(e)));
    },
    [cam, flash],
  );
  const switchCam = (step: number) => setCamView((v) => (v && v.ids.length > 1 ? { ...v, index: (v.index + step + v.ids.length) % v.ids.length } : v));

  const ptzStop = useRef(() => undefined as void);
  ptzStop.current = () => ptz('stop');

  /* ---------- teclas do controle ---------- */
  const onKey = useRef<(k: TvKey, e: KeyboardEvent) => boolean>(() => false);
  onKey.current = (k, e) => {
    if (saver) {
      setSaver(false);
      return true; // a 1ª tecla só acorda a tela
    }
    if (k === 'back') {
      if (!deep) return false; // na tela inicial, o “voltar” sai do navegador normalmente
      if (history.state?.lunaTv) history.back();
      else back.current();
      return true;
    }
    if (camView) {
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
        if (cam?.ptz) {
          if (!e.repeat && !ptzHeld.current) {
            ptzHeld.current = true;
            setPtzDir(k);
            ptz(k);
          }
        } else if (k === 'left' || k === 'right') switchCam(k === 'left' ? -1 : 1);
        return true;
      }
      if (k === 'ok' || k === 'next') switchCam(1);
      else if (k === 'prev') switchCam(-1);
      return true;
    }
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
      const list = items();
      const cur = list.find((el) => el.dataset.tv === focus);
      if (!cur) {
        if (list[0]?.dataset.tv) setFocus(list[0].dataset.tv);
        return true;
      }
      const i = nextFocus(cur.getBoundingClientRect(), list.map((el) => el.getBoundingClientRect()), k);
      if (i >= 0 && list[i].dataset.tv) setFocus(list[i].dataset.tv!);
      return true;
    }
    if (k === 'ok') {
      findEl(focus)?.click();
      return true;
    }
    if ((k === 'prev' || k === 'next') && focus.startsWith('dev:')) {
      const d = useDevices.getState().devices[focus.slice(4)];
      if (d?.supportsBrightness) {
        const v = Math.max(5, Math.min(100, (d.isOn ? (d.brightness ?? 100) : 0) + (k === 'next' ? 20 : -20)));
        void useDevices.getState().brightness(d.entityId, v);
      }
      return true;
    }
    return false;
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      lastInput.current = Date.now();
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = tvKey(e);
      if (k && onKey.current(k, e)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = tvKey(e);
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
        if (ptzHeld.current) {
          ptzHeld.current = false;
          ptzStop.current();
        }
        setPtzDir(null);
      }
    };
    const poke = () => {
      lastInput.current = Date.now();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('pointermove', poke, { passive: true });
    window.addEventListener('pointerdown', poke, { passive: true });
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('pointermove', poke);
      window.removeEventListener('pointerdown', poke);
    };
  }, []);

  /** Propriedades de um item navegável pelo controle (também funciona com o cursor do navegador). */
  const F = (id: string, first?: boolean) => ({
    'data-tv': id,
    'data-focused': focus === id && !camView && !saver ? '' : undefined,
    'data-tv-first': first ? '' : undefined,
    onMouseEnter: () => setFocus(id),
  });

  /* ---------- peças ---------- */
  const deviceTile = (d: DeviceDto, first?: boolean) => {
    const Icon = deviceIcon(d);
    return (
      <button key={d.entityId} className="tv-item" {...F(`dev:${d.entityId}`, first)} onClick={() => void toggle(d)}>
        <div className={`tv-tile ${d.isOn ? 'on' : ''} ${d.available ? '' : 'off-line'}`}>
          {busy[d.entityId] && <span className="busy" />}
          <Icon />
          <div className="n">{d.name}</div>
          <div className="s">{!d.available ? 'indisponível' : d.isOn ? `ligada${d.brightness !== null && d.supportsBrightness ? ` · ${d.brightness}%` : ''}` : 'desligada'}</div>
        </div>
      </button>
    );
  };
  const shortcut = (id: string, Icon: typeof Moon, label: string, onClick: () => void) => (
    <button key={id} className="tv-item" {...F(id)} onClick={onClick}>
      <div className="tv-tile">
        <Icon />
        <div className="n">{label}</div>
        <div className="s">atalho · {lights.length} luzes</div>
      </div>
    </button>
  );
  const camCard = (c: CameraDto, i: number, ids: string[], live?: boolean, first?: boolean) => (
    <button key={c.entityId} className="tv-item" {...F(`cam:${c.entityId}`, first)} onClick={() => openCamera(ids, i)}>
      <div className="tv-cam">
        <CameraThumb camera={c} everyMs={live ? 4000 : 8000} />
        {!c.available && <b className="tv-live" style={{ background: '#334155' }}>offline</b>}
        <span className="lbl">{c.name}</span>
      </div>
    </button>
  );

  const statusPanel = (
    <div className="tv-panel">
      <div className="tv-h">
        Status do sistema<i>S-01</i>
      </div>
      <Bar label="Home Assist." value={haConnected ? 100 : 0} text={haConnected ? 'ON' : 'OFF'} warn={haConnected === false} />
      <Bar label="IA local" value={health?.services.ollama.ok ? 100 : 0} text={health?.services.ollama.ok ? 'ON' : 'OFF'} warn={!!health && !health.services.ollama.ok} />
      <Bar label="CPU" value={health?.system?.cpuPercent ?? 0} text={health?.system ? `${health.system.cpuPercent}%` : '—'} warn={(health?.system?.cpuPercent ?? 0) > 90} />
      <Bar label="Memória" value={health?.system?.memoryPercent ?? 0} text={health?.system ? `${health.system.memoryPercent}%` : '—'} warn={(health?.system?.memoryPercent ?? 0) > 90} />
    </div>
  );
  const envPanel = (
    <div className="tv-panel">
      <div className="tv-h">
        Ambiente<i>W-02</i>
      </div>
      {weather ? (
        <div className="tv-env">
          <div>
            <b>{round(weather.current.temperature)}°</b>
            <small>{weather.current.condition}</small>
          </div>
          <div>
            <b>{weather.current.humidity}%</b>
            <small>Umidade</small>
          </div>
          <div>
            <b>{rain ? `${rain.prob}%` : `${weather.daily[0]?.precipitationProbability ?? 0}%`}</b>
            <small>{rain ? `Chuva ${rain.hour}` : 'Chuva hoje'}</small>
          </div>
          <div>
            <b>{round(weather.current.windSpeed)}</b>
            <small>km/h vento</small>
          </div>
        </div>
      ) : (
        <p className="tv-small">Defina a localização de casa nos Ajustes (pelo celular).</p>
      )}
    </div>
  );
  const globe = (tags: boolean) => (
    <div className="tv-center">
      <div className="tv-radar" />
      <LunaOrb state={remoteState} size={470} />
      {tags && (
        <>
          <div className="tv-tag" style={{ left: 0, top: '12%' }}>
            {lightsOn === 1 ? '1 luz acesa' : `${lightsOn} luzes acesas`}
          </div>
          <div className="tv-tag" style={{ right: 0, top: '20%' }}>
            {rain ? `chuva às ${rain.hour}` : weather ? 'sem chuva próxima' : 'clima'}
          </div>
          {health && (
            <div className="tv-tag" style={{ right: '2%', bottom: '30%' }}>
              {health.services.ollama.ok ? `IA local · ${health.services.ollama.model.split(':')[0]}` : 'IA local offline'}
            </div>
          )}
        </>
      )}
      <div className="tv-state">{STATE_LABEL[remoteState] ?? remoteState}</div>
    </div>
  );

  /* ---------- abas ---------- */
  let content: React.ReactNode;
  let hint: [string, string][] = [
    ['◀▶▲▼', 'navegar'],
    ['OK', 'ligar / abrir'],
    ['↩', 'voltar'],
  ];
  if (tab === 'inicio') {
    const homeCams = camList.slice(0, 3);
    content = (
      <>
        <div className="tv-mid">
          <div className="tv-col l">
            {statusPanel}
            {envPanel}
          </div>
          {globe(true)}
          <div className="tv-col r">
            <div className="tv-panel">
              <div className="tv-h">
                Controle da casa
                <i>
                  {toggles.filter((d) => d.isOn).length}/{toggles.length} ativos
                </i>
              </div>
              <div className="tv-grid">
                {toggles.slice(0, 4).map((d, i) => deviceTile(d, i === 0))}
                {lights.length > 0 && shortcut('sc:off', Moon, 'Apagar tudo', () => void allLights(false))}
                {lights.length > 0 && shortcut('sc:on', Sun, 'Acender tudo', () => void allLights(true))}
              </div>
              {!toggles.length && <p className="tv-empty">{haConnected === false ? 'Home Assistant offline.' : 'Nenhum aparelho controlável.'}</p>}
            </div>
          </div>
        </div>
        {homeCams.length > 0 && (
          <div className="tv-camrow">
            <div className="tilt">
              {homeCams.map((c, i) => camCard(c, i, camList.map((x) => x.entityId), true))}
            </div>
          </div>
        )}
      </>
    );
  } else if (tab === 'casa') {
    const groups: [string, DeviceDto[]][] = [
      ['Atalhos', []],
      ['Iluminação', toggles.filter((d) => d.category === 'lighting')],
      ['Tomadas e interruptores', toggles.filter((d) => d.category === 'outlets' || d.category === 'switches')],
      ['Climatização', toggles.filter((d) => d.category === 'climate')],
      ['Outros', toggles.filter((d) => d.category === 'other')],
    ];
    hint = [
      ['◀▶▲▼', 'navegar'],
      ['OK', 'ligar / desligar'],
      ['⏪⏩', 'brilho'],
      ['↩', 'voltar'],
    ];
    content = (
      <div className="tv-mid wide">
        <div className="tv-col l">
          <div className="tv-panel grow">
            <div className="tv-h">
              Sensores<i>{sensors.length}</i>
            </div>
            <div className="tv-scroll">
              {sensors.length ? (
                sensors.map((s) => (
                  <div key={s.entityId} className="tv-bar" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span style={{ textTransform: 'none', letterSpacing: '0.04em', fontSize: 22 }}>{s.name}</span>
                    <span>
                      {s.state}
                      {s.unit ? ` ${s.unit}` : ''}
                    </span>
                  </div>
                ))
              ) : (
                <p className="tv-small">Nenhum sensor.</p>
              )}
            </div>
          </div>
        </div>
        <div className="tv-col r soft">
          <div className="tv-panel grow">
            <div className="tv-h">
              Controle da casa
              <i>
                {toggles.filter((d) => d.isOn).length}/{toggles.length} ativos
              </i>
            </div>
            <div className="tv-scroll">
              {groups.map(([title, list]) =>
                title === 'Atalhos' ? (
                  lights.length > 0 && (
                    <div key={title}>
                      <p className="tv-sec">{title}</p>
                      <div className="tv-grid c4">
                        {shortcut('sc:off', Moon, 'Apagar tudo', () => void allLights(false))}
                        {shortcut('sc:on', Sun, 'Acender tudo', () => void allLights(true))}
                      </div>
                    </div>
                  )
                ) : list.length ? (
                  <div key={title}>
                    <p className="tv-sec">{title}</p>
                    <div className="tv-grid c4">
                      {list.map((d, i) => deviceTile(d, title === 'Iluminação' && i === 0))}
                    </div>
                  </div>
                ) : null,
              )}
              {!toggles.length && <p className="tv-empty">Nenhum aparelho controlável.</p>}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (tab === 'cameras') {
    hint = [
      ['◀▶▲▼', 'escolher'],
      ['OK', 'ver ao vivo'],
      ['↩', 'voltar'],
    ];
    content = (
      <div className="tv-camgrid">
        {camList.length ? (
          <div className="tv-grid c3">
            {camList.map((c, i) => camCard(c, i, camList.map((x) => x.entityId), false, i === 0))}
          </div>
        ) : (
          <p className="tv-empty">{cameras ? 'Nenhuma câmera no Home Assistant.' : 'Carregando câmeras…'}</p>
        )}
      </div>
    );
  } else {
    hint = [
      ['◀▶', 'trocar aba'],
      ['↩', 'voltar'],
    ];
    content = (
      <div className="tv-mid">
        <div className="tv-col l">
          {envPanel}
          {weather && (
            <div className="tv-panel">
              <div className="tv-h">Hoje</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <WeatherIcon code={weather.current.weatherCode} isDay={weather.current.isDay} className="h-20 w-20" />
                <div>
                  <p style={{ fontSize: 28, color: '#fff' }}>{weather.current.condition}</p>
                  <p className="tv-small">sensação {round(weather.current.apparentTemperature)}°</p>
                  <p className="tv-small">
                    mín {round(weather.daily[0]?.min ?? 0)}° · máx {round(weather.daily[0]?.max ?? 0)}°
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        {globe(false)}
        <div className="tv-col r">
          <div className="tv-panel">
            <div className="tv-h">
              Próximos dias<i>F-07</i>
            </div>
            {weather ? (
              weather.daily.slice(0, 7).map((d, i) => (
                <div key={d.date} className="tv-bar" style={{ gridTemplateColumns: '90px 40px 1fr 70px 110px', fontSize: 21 }}>
                  <span>{i === 0 ? 'Hoje' : new Date(`${d.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                  <WeatherIcon code={d.weatherCode} className="h-7 w-7" />
                  <span style={{ textTransform: 'none', letterSpacing: '0.02em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{d.condition}</span>
                  <span style={{ color: d.precipitationProbability >= 40 ? '#7dd3fc' : 'rgba(216,246,255,.4)', fontFamily: 'var(--font-hud)' }}>{d.precipitationProbability}%</span>
                  <span>
                    {round(d.min)}° / {round(d.max)}°
                  </span>
                </div>
              ))
            ) : (
              <p className="tv-small">Sem localização de casa.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-root">
      <div ref={stageRef} className="tv-stage" style={{ transform: `translate(${stage.x}px, ${stage.y}px) scale(${stage.scale})` }}>
        <TvScene />
        {!camView && !saver && (
          <div className="tv-safe">
            <header className="tv-head">
              <div className="tv-pill">
                <i className={server ? '' : 'off'} />
                {server ? 'Oi, Dia · pelo celular' : 'Reconectando…'}
              </div>
              <div className="tv-brand">
                <p>DIA</p>
                <b>{fmtTime(now)}</b>
                <span>{fmtDate(now)}</span>
              </div>
              <nav className="tv-tabs">
                {TABS.map((t) => (
                  <button key={t.id} className={`tv-tab ${tab === t.id ? 'on' : ''}`} {...F(`tab:${t.id}`)} onClick={() => goTab(t.id)}>
                    {t.label}
                  </button>
                ))}
                <button className="tv-tab" {...F('tab:exit')} onClick={() => setTvMode('off')} title="Sair do modo TV">
                  <Smartphone className="h-6 w-6" />
                </button>
              </nav>
            </header>
            <div className="tv-main" key={tab}>
              {content}
            </div>
            {!reply && <Hint items={hint} />}
          </div>
        )}

        {reply && !saver && (
          <div className="tv-reply tv-panel">
            <div className="tv-h">
              DIA<i>pedido pelo celular</i>
            </div>
            <p className="you">Você: “{reply.userText}”</p>
            <p>{reply.reply}</p>
          </div>
        )}

        {camView && (
          <div className="tv-camfull">
            <div className="tv-screen">
              {cam ? <CameraPlayer key={cam.entityId} camera={cam} /> : <p className="tv-empty">{cameras ? 'Câmera não encontrada.' : 'Carregando…'}</p>}
              {cam && <span className="tv-camname">{cam.name}</span>}
            </div>
            {cam?.ptz && (
              <div className="tv-pad" aria-hidden="true">
                <i className={`u ${ptzDir === 'up' ? 'on' : ''}`}>▲</i>
                <i className={`d ${ptzDir === 'down' ? 'on' : ''}`}>▼</i>
                <i className={`l ${ptzDir === 'left' ? 'on' : ''}`}>◀</i>
                <i className={`r ${ptzDir === 'right' ? 'on' : ''}`}>▶</i>
                <b>GIRAR</b>
              </div>
            )}
            {camView.ids.length > 1 && (
              <div className="tv-dots">
                {camView.ids.map((id, i) => (
                  <i key={id} className={i === camView.index % camView.ids.length ? 'on' : ''} />
                ))}
              </div>
            )}
            <Hint
              items={[
                ...(cam?.ptz ? ([['◀▶▲▼', 'girar câmera (segure)']] as [string, string][]) : camView.ids.length > 1 ? ([['◀▶', 'trocar câmera']] as [string, string][]) : []),
                ...(camView.ids.length > 1 ? ([['OK', 'próxima câmera']] as [string, string][]) : []),
                ['↩', 'voltar'],
              ]}
            />
          </div>
        )}

        {saver && <Saver now={now} weather={weather} lightsOn={lightsOn} outletsOn={outletsOn} cameras={camList.filter((c) => c.available)} />}
        {toast && <div className="tv-toast">{toast}</div>}
      </div>
    </div>
  );
}

/** Protetor de tela: relógio, clima, resumo da casa e uma câmera por vez (muda a cada 12 s). */
function Saver({ now, weather, lightsOn, outletsOn, cameras }: { now: Date; weather: WeatherDto | null; lightsOn: number; outletsOn: number; cameras: CameraDto[] }) {
  const [i, setI] = useState(0);
  const [drift, setDrift] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 12_000);
    // muda levemente de posição a cada minuto (evita marcar a tela)
    const d = setInterval(() => setDrift((n) => (n + 1) % 4), 60_000);
    return () => {
      clearInterval(t);
      clearInterval(d);
    };
  }, []);
  const cam = cameras.length ? cameras[i % cameras.length] : null;
  const rain = nextRain(weather);
  const offsets = ['0px, 0px', '24px, -18px', '-20px, 16px', '14px, 22px'];
  return (
    <div className="tv-saver" style={{ transform: `translate(${offsets[drift]})` }}>
      <div className="l">
        <div className="tv-big">{fmtTime(now)}</div>
        <div style={{ marginTop: 16, fontSize: 30, letterSpacing: '0.3em', color: 'rgba(0,229,255,.75)', textTransform: 'uppercase' }}>{fmtDate(now)}</div>
        {weather && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 40, fontSize: 30 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 76, color: '#fff' }}>{round(weather.current.temperature)}°</b>
            <div>
              {weather.current.condition}
              <br />
              <span style={{ color: '#7dd3fc', fontSize: 26 }}>{rain ? `chuva ${rain.prob}% às ${rain.hour}` : 'sem chuva nas próximas horas'}</span>
            </div>
          </div>
        )}
        <div style={{ marginTop: 34, fontSize: 24, color: 'rgba(216,246,255,.55)' }}>
          {lightsOn === 1 ? '1 luz acesa' : `${lightsOn} luzes acesas`} · {outletsOn === 1 ? '1 tomada ligada' : `${outletsOn} tomadas ligadas`}
        </div>
      </div>
      <div className="r">
        {cam && (
          <div className="tv-panel tv-fade" key={cam.entityId} style={{ padding: 20 }}>
            <div className="tv-h">
              Câmera · {cam.name}
              <i>
                {(i % cameras.length) + 1}/{cameras.length}
              </i>
            </div>
            <CameraThumb camera={cam} everyMs={4000} className="aspect-video w-full" />
          </div>
        )}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 20, letterSpacing: '0.2em', color: 'rgba(0,229,255,.55)' }}>QUALQUER TECLA PARA VOLTAR</div>
      </div>
    </div>
  );
}
