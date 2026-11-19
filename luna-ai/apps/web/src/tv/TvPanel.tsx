import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bed, Bot, Cat, Cctv, Fan, Film, Home, Lightbulb, Moon, Plug, Power, PowerOff, Smartphone, Sparkles, Sun, Users, Video, WashingMachine } from 'lucide-react';
import type { CameraDto, DeviceDto, PtzAction, TvPanelDto, TvSceneIcon, WeatherDto } from '@luna/shared/types';
import { api, errorMessage } from '../services/api';
import { useDevices } from '../stores/devices';
import { useCameras } from '../stores/cameras';
import { useLitter } from '../stores/litter';
import { useWasher } from '../stores/washer';
import { usePeople } from '../stores/people';
import { unseenRecados, useRecados } from '../stores/recados';
import { usePhotos } from '../stores/photos';
import { useSettings } from '../stores/settings';
import { useTv } from '../stores/tv';
import { useClock, useWeather } from '../hooks/useWeather';
import { acquireScreen, releaseScreen } from '../lib/wakeLock';
import { nextFocus, tvKey, type TvKey } from '../lib/tv';
import { normalizeName } from '../lib/houseLinks';
import { canLaunchApps, defaultApps, launchApp, listApps, saveApps, savedApps, type NativeApp } from '../lib/nativeApps';
import { peopleLine } from '../components/PeopleCard';
import { CameraPlayer, CameraThumb } from '../components/CameraPlayer';
import './panel.css';

/**
 * Painel da TV (Fire TV Stick): controle manual da casa, sem a assistente. Feito para aparelho fraco:
 * nada de sombra, desfoque ou canvas; só cor, borda e transform. Câmeras abrem em imagens (leve) e o
 * vídeo ao vivo é opcional. Depois de 5 min sem usar o controle, entra o protetor com as fotos da família.
 */

type Tab = 'inicio' | 'luzes' | 'cameras' | 'casa';
const TABS: { id: Tab; label: string }[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'luzes', label: 'Luzes' },
  { id: 'cameras', label: 'Câmeras' },
  { id: 'casa', label: 'Casa' },
];
export const PANEL_SAVER_MS = 5 * 60_000;
/** Segurar OK por este tempo numa luz com brilho: entra no ajuste de brilho */
const HOLD_MS = 550;
const PHOTO_MS = 15_000;
const FADE_MS = 1_500;

const SCENE_ICON: Record<TvSceneIcon, typeof Film> = { film: Film, moon: Moon, sun: Sun, off: PowerOff, bed: Bed, spark: Sparkles };
const isToggle = (d: DeviceDto) => d.controllable && d.isOn !== null && !d.hidden && d.category !== 'sensors' && d.domain !== 'vacuum';
const isLightish = (d: DeviceDto) => d.category === 'lighting' || d.entityId.startsWith('fan.') || /ventilador/i.test(d.name);
const deviceIcon = (d: DeviceDto) => (d.category === 'lighting' ? Lightbulb : d.entityId.startsWith('fan.') || /ventilador/i.test(d.name) ? Fan : d.category === 'outlets' ? Plug : Power);
const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Cômodo pelo nome do aparelho (o Home Assistant não informa a área para a Luna). */
const ROOMS: [RegExp, string][] = [
  [/\b(luiza|bebe)\b/, 'Quarto da Luiza'],
  [/\b(suite|casal|cabeceira)\b/, 'Suíte'],
  [/\bsala\b/, 'Sala'],
  [/\bcozinha\b/, 'Cozinha'],
  [/\b(banheiro|lavabo)\b/, 'Banheiros'],
  [/\bquarto\b/, 'Quartos'],
  [/\b(escritorio)\b/, 'Escritório'],
  [/\bgaragem\b/, 'Garagem'],
  [/\b(varanda|quintal|externa|jardim|fachada|area|piscina|churrasqueira)\b/, 'Área externa'],
];
export function roomOf(name: string) {
  const n = normalizeName(name);
  return ROOMS.find(([re]) => re.test(n))?.[1] ?? 'Outras';
}

function nextRain(w: WeatherDto | null) {
  const h = w?.hourly.slice(0, 12).find((x) => x.precipitationProbability >= 40);
  return h ? `chuva ${h.precipitationProbability}% às ${Number(h.time.slice(11, 13))}h` : null;
}

/** Palco 1920×1080 escalado para caber na tela (o Fire TV informa 960×540). */
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

function Hint({ items }: { items: [string, string][] }) {
  return (
    <div className="tp-hint">
      {items.map(([k, t]) => (
        <span key={t}>
          <b className="tp-key">{k}</b>
          {t}
        </span>
      ))}
    </div>
  );
}

export default function TvPanel() {
  const stage = useStageScale();
  const stageRef = useRef<HTMLDivElement>(null);
  const now = useClock();
  const { data: weather } = useWeather('home');
  const devicesMap = useDevices((s) => s.devices);
  const busy = useDevices((s) => s.busy);
  const haConnected = useDevices((s) => s.haConnected);
  const { cameras, load: loadCameras } = useCameras();
  const boxes = useLitter((s) => s.boxes);
  const washers = useWasher((s) => s.washers);
  const people = usePeople((s) => s.list);
  const recados = useRecados((s) => s.list);
  const photoIds = usePhotos((s) => s.ids);
  const setTvMode = useSettings((s) => s.setTvMode);
  const lastReply = useTv((s) => s.lastReply);

  const [panel, setPanel] = useState<TvPanelDto | null>(null);
  const [tab, setTab] = useState<Tab>('inicio');
  const [focus, setFocus] = useState('');
  const [camView, setCamView] = useState<{ ids: string[]; index: number; live: boolean } | null>(null);
  const [saver, setSaver] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** Luz no ajuste de brilho (◀▶) depois de segurar OK */
  const [dimming, setDimming] = useState<string | null>(null);
  /** Brilho mostrado enquanto o pedido não volta do Home Assistant */
  const [dimLocal, setDimLocal] = useState<Record<string, number>>({});
  const [confirmClean, setConfirmClean] = useState<string | null>(null);
  /** Atalhos de aplicativos (só no app Android da Luna): todos os instalados e os escolhidos para o Início */
  const [apps, setApps] = useState<NativeApp[] | null>(null);
  const [myApps, setMyApps] = useState<string[]>([]);
  const [appsEdit, setAppsEdit] = useState(false);
  useEffect(() => {
    if (!canLaunchApps()) return;
    // Depois da primeira tela: listar os apps (com os ícones) leva um instante na Fire TV
    const t = window.setTimeout(() => {
      const all = listApps();
      setApps(all);
      setMyApps(savedApps() ?? defaultApps(all));
    }, 400);
    return () => clearTimeout(t);
  }, []);
  const lastInput = useRef(Date.now());

  useEffect(() => {
    void acquireScreen();
    return () => releaseScreen();
  }, []);

  const loadPanel = useCallback(() => void api<TvPanelDto>('/api/tv/panel').then(setPanel, () => undefined), []);
  useEffect(() => {
    loadPanel();
    if (!cameras) void loadCameras();
    if (!useLitter.getState().boxes) void useLitter.getState().load();
    if (!useWasher.getState().washers) void useWasher.getState().load();
    if (!usePeople.getState().list) void usePeople.getState().load();
    if (!useRecados.getState().list) void useRecados.getState().load();
    if (!usePhotos.getState().ids) void usePhotos.getState().load();
    // A lista do Início acompanha mudanças feitas pelo celular
    const t = setInterval(loadPanel, 10 * 60_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const devices = useMemo(() => Object.values(devicesMap).filter((d) => !d.hidden), [devicesMap]);
  const toggles = useMemo(() => devices.filter(isToggle).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [devices]);
  const lightsOn = devices.filter((d) => d.category === 'lighting' && d.controllable && d.isOn).length;
  const favorites = useMemo(() => (panel?.favorites ?? []).map((id) => devicesMap[id]).filter((d): d is DeviceDto => !!d && isToggle(d)), [panel, devicesMap]);
  const vacuums = devices.filter((d) => d.domain === 'vacuum' && d.vacuum);
  const camList = cameras ?? [];
  const fresh = unseenRecados(recados);
  const who = peopleLine(people);

  const flash = useCallback((msg: string, ms = 4000) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), ms);
  }, []);

  const toggle = useCallback(
    async (d: DeviceDto) => {
      await useDevices.getState().toggle(d);
      const err = useDevices.getState().error;
      if (err) flash(err);
    },
    [flash],
  );

  /* ---------- brilho: mostra na hora, manda ao parar de apertar ---------- */
  const dimTimer = useRef<Record<string, number>>({});
  const nudge = useCallback((d: DeviceDto, delta: number) => {
    if (!d.supportsBrightness || !d.available) return;
    setDimLocal((m) => {
      const base = m[d.entityId] ?? (d.isOn ? (d.brightness ?? 100) : 0);
      const v = Math.max(0, Math.min(100, Math.round((base + delta) / 10) * 10 || (delta > 0 ? 10 : 0)));
      clearTimeout(dimTimer.current[d.entityId]);
      dimTimer.current[d.entityId] = window.setTimeout(() => {
        void useDevices
          .getState()
          .brightness(d.entityId, v)
          .finally(() => window.setTimeout(() => setDimLocal(({ [d.entityId]: _, ...rest }) => rest), 800));
      }, 450);
      return { ...m, [d.entityId]: v };
    });
  }, []);

  const runScene = useCallback(
    async (id: string, name: string) => {
      flash(`${name}…`, 2500);
      try {
        const r = await api<{ ok: boolean; count: number; failed: string[] }>(`/api/tv/scene/${id}`, { method: 'POST' });
        flash(r.ok ? `${name}: pronto` : `${name}: ${r.failed.length} não responderam`);
        void useDevices.getState().load(true);
      } catch (err) {
        flash(errorMessage(err));
      }
    },
    [flash],
  );

  const cleanBox = useCallback(
    async (id: string) => {
      if (confirmClean !== id) {
        setConfirmClean(id);
        window.setTimeout(() => setConfirmClean((c) => (c === id ? null : c)), 5000);
        return;
      }
      setConfirmClean(null);
      const err = await useLitter.getState().clean(id);
      flash(err ?? 'Limpando a caixa de areia…');
    },
    [confirmClean, flash],
  );

  const vacuum = useCallback(
    async (d: DeviceDto) => {
      const v = d.vacuum!;
      const going = v.phase === 'cleaning' || v.phase === 'returning';
      const err = await useDevices.getState().vacuum(d.entityId, going ? 'return_to_base' : 'start');
      flash(err ?? (going ? `${d.name} voltando para a base` : `${d.name} começou a aspirar`));
    },
    [flash],
  );

  const openCamera = useCallback((ids: string[], index = 0, live = false) => {
    if (ids.length) setCamView({ ids, index, live });
  }, []);

  // “Mostrar câmera na TV” pedido pelo celular
  useEffect(() => {
    if (!lastReply?.cameraIds.length) return;
    setSaver(false);
    lastInput.current = Date.now();
    openCamera(lastReply.cameraIds);
  }, [lastReply, openCamera]);

  // Protetor de tela depois de 5 min sem o controle (não cobre a câmera aberta)
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!camView && Date.now() - lastInput.current > PANEL_SAVER_MS) setSaver(true);
    }, 5000);
    return () => clearInterval(t);
  }, [camView]);

  /* ---------- foco ---------- */
  const items = () => Array.from(stageRef.current?.querySelectorAll<HTMLElement>('[data-tv]') ?? []);
  const findEl = (id: string) => items().find((e) => e.dataset.tv === id) ?? null;
  useEffect(() => {
    if (camView || saver) return;
    if (focus && findEl(focus)) return;
    const first = stageRef.current?.querySelector<HTMLElement>('[data-tv-first]') ?? stageRef.current?.querySelector<HTMLElement>('.tp-main [data-tv]');
    if (first?.dataset.tv) setFocus(first.dataset.tv);
  });
  useEffect(() => {
    const el = findEl(focus);
    if (!el || el.closest('.tp-tabs')) return;
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (dimming && focus !== `dev:${dimming}`) setDimming(null);
  }, [focus, dimming]);

  const goTab = (t: Tab) => {
    setTab(t);
    setFocus(`tab:${t}`);
  };

  /* ---------- voltar ---------- */
  const deep = !!camView || tab !== 'inicio' || !!dimming || appsEdit;
  const back = useRef<() => void>(() => undefined);
  back.current = () => {
    if (camView) setCamView(null);
    else if (dimming) setDimming(null);
    else if (appsEdit) {
      setAppsEdit(false);
      setFocus('app:edit');
    } else if (tab !== 'inicio') goTab('inicio');
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
  const ptz = useCallback((action: PtzAction) => cam && void api(`/api/cameras/${cam.entityId}/ptz`, { body: { action } }).catch((e) => flash(errorMessage(e))), [cam, flash]);
  const ptzStop = useRef(() => undefined as void);
  ptzStop.current = () => ptz('stop');
  const switchCam = (step: number) => setCamView((v) => (v && v.ids.length > 1 ? { ...v, index: (v.index + step + v.ids.length) % v.ids.length, live: false } : v));

  /* ---------- teclas ---------- */
  const focusedDevice = () => (focus.startsWith('dev:') ? useDevices.getState().devices[focus.slice(4)] : undefined);
  const okTimer = useRef(0);
  const okHeld = useRef(false);
  const onKey = useRef<(k: TvKey, e: KeyboardEvent) => boolean>(() => false);
  onKey.current = (k, e) => {
    if (saver) {
      setSaver(false);
      return true; // a 1ª tecla só acorda a tela
    }
    if (k === 'back') {
      if (!deep) return false;
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
      if (k === 'ok' || k === 'play') setCamView((v) => (v ? { ...v, live: !v.live } : v));
      else if (k === 'next') switchCam(1);
      else if (k === 'prev') switchCam(-1);
      return true;
    }
    if (dimming) {
      const d = useDevices.getState().devices[dimming];
      if ((k === 'left' || k === 'right') && d) nudge(d, k === 'right' ? 10 : -10);
      else if (k === 'ok' || k === 'up' || k === 'down') setDimming(null);
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
      const d = focusedDevice();
      // Luz com brilho: toque curto liga/desliga; segurando, ajusta o brilho
      if (d?.supportsBrightness && d.available) {
        if (!e.repeat && !okTimer.current) {
          okHeld.current = false;
          okTimer.current = window.setTimeout(() => {
            okTimer.current = 0;
            okHeld.current = true;
            setDimming(d.entityId);
          }, HOLD_MS);
        }
        return true;
      }
      if (!e.repeat) findEl(focus)?.click();
      return true;
    }
    if (k === 'prev' || k === 'next') {
      const d = focusedDevice();
      if (d) nudge(d, k === 'next' ? 10 : -10);
      return true;
    }
    if (k === 'play' && focus.startsWith('cam:')) {
      const ids = camList.map((c) => c.entityId);
      openCamera(ids, Math.max(0, ids.indexOf(focus.slice(4))), true);
      return true;
    }
    return false;
  };
  const onKeyUp = useRef<(k: TvKey) => void>(() => undefined);
  onKeyUp.current = (k) => {
    if (k === 'ok' && okTimer.current) {
      clearTimeout(okTimer.current);
      okTimer.current = 0;
      if (!okHeld.current) findEl(focus)?.click();
    }
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
      if (ptzHeld.current) {
        ptzHeld.current = false;
        ptzStop.current();
      }
      setPtzDir(null);
    }
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
      if (k) onKeyUp.current(k);
    };
    const poke = () => {
      lastInput.current = Date.now();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('pointerdown', poke, { passive: true });
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('pointerdown', poke);
    };
  }, []);

  const F = (id: string, first?: boolean) => ({
    'data-tv': id,
    'data-focused': focus === id && !camView && !saver ? '' : undefined,
    'data-tv-first': first ? '' : undefined,
    onMouseEnter: () => setFocus(id),
  });

  /* ---------- peças ---------- */
  const tile = (d: DeviceDto, first?: boolean) => {
    const Icon = deviceIcon(d);
    const local = dimLocal[d.entityId];
    const pct = local ?? (d.isOn ? d.brightness : null);
    const on = local !== undefined ? local > 0 : d.isOn === true;
    const isFocused = focus === `dev:${d.entityId}`;
    const fem = d.category === 'lighting' || d.category === 'outlets';
    return (
      <button key={d.entityId} className={`tp-tile ${on ? 'on' : ''} ${d.available ? '' : 'na'} ${dimming === d.entityId ? 'dim' : ''}`} {...F(`dev:${d.entityId}`, first)} onClick={() => void toggle(d)}>
        {isFocused && d.supportsBrightness && d.available && <span className="tp-tip">{dimming === d.entityId ? '◀ ▶ brilho' : 'segure OK'}</span>}
        {busy[d.entityId] && <span className="tp-busy" />}
        <span className="tp-bulb">
          <Icon />
        </span>
        <span className="n">{d.name}</span>
        <span className="st">
          {!d.available ? 'indisponível' : on ? `${fem ? 'ligada' : 'ligado'}${d.supportsBrightness && pct !== null ? ` · ${pct}%` : ''}` : fem ? 'desligada' : 'desligado'}
        </span>
        {d.supportsBrightness && (
          <span className="tp-bar">
            <i style={{ width: `${on ? (pct ?? 100) : 0}%` }} />
          </span>
        )}
      </button>
    );
  };

  const camCard = (c: CameraDto, i: number, everyMs: number, first?: boolean) => (
    <button key={c.entityId} className="tp-cam" {...F(`cam:${c.entityId}`, first)} onClick={() => openCamera(camList.map((x) => x.entityId), i)}>
      <CameraThumb camera={c} everyMs={everyMs} />
      {!c.available && <b className="tp-off">offline</b>}
      <span className="lbl">{c.name}</span>
    </button>
  );

  const washer = washers?.find((w) => w.available);
  const box = boxes?.find((b) => b.available);
  const chips = (
    <div className="tp-chips">
      {who && (
        <span className="tp-chip">
          <Users />
          {who}
        </span>
      )}
      {fresh.length > 0 && (
        <span className="tp-chip warn">
          <Video />
          {fresh.length === 1 ? `Recado novo de ${fresh[0]!.fromName}` : `${fresh.length} recados novos`}
        </span>
      )}
      {washer && (washer.running || washer.status === 'end') && (
        <span className="tp-chip">
          <WashingMachine />
          {washer.running ? `Lava e seca · ${washer.statusLabel}${washer.remainingMin !== null ? ` · ${washer.remainingMin} min` : ''}` : 'Lava e seca terminou'}
        </span>
      )}
      {box && (
        <span className="tp-chip">
          <Cat />
          Caixa de areia · {box.statusLabel.toLowerCase()}
        </span>
      )}
    </div>
  );

  /* ---------- aplicativos ---------- */
  const shownApps = (apps ?? []).length ? myApps.map((pkg) => apps!.find((a) => a.pkg === pkg)).filter((a): a is NativeApp => !!a) : [];
  const openApp = (a: NativeApp) => {
    if (!launchApp(a.pkg)) flash(`Não consegui abrir ${a.label}.`);
  };
  const flipApp = (pkg: string) => {
    const next = myApps.includes(pkg) ? myApps.filter((x) => x !== pkg) : [...myApps, pkg];
    setMyApps(next);
    saveApps(next);
  };
  const appTile = (a: NativeApp, editing = false, first = false) => {
    const on = myApps.includes(a.pkg);
    return (
      <button key={a.pkg} className={`tp-app ${editing && on ? 'sel' : ''} ${a.banner ? 'has-banner' : ''}`} {...F(`${editing ? 'pick' : 'app'}:${a.pkg}`, first)} onClick={() => (editing ? flipApp(a.pkg) : openApp(a))}>
        {a.banner ? <img src={a.banner} alt="" /> : a.icon ? <img className="ic" src={a.icon} alt="" /> : null}
        {!a.banner && <span className="lbl">{a.label}</span>}
        {editing && <span className="chk">{on ? '✓' : ''}</span>}
      </button>
    );
  };
  const appsRow = canLaunchApps() && apps !== null && (
    <>
      <h2 className="tp-h">Aplicativos</h2>
      <div className="tp-row c6">
        {shownApps.map((a) => appTile(a))}
        <button className="tp-app add" {...F('app:edit')} onClick={() => setAppsEdit(true)}>
          <span className="plus">{shownApps.length ? '✎' : '+'}</span>
          <span className="lbl">{shownApps.length ? 'Escolher apps' : 'Adicionar apps'}</span>
        </button>
      </div>
    </>
  );

  /* ---------- abas ---------- */
  let content: React.ReactNode;
  let hint: [string, string][] = [
    ['◀▶▲▼', 'navegar'],
    ['OK', 'liga / desliga · abre'],
    ['segure OK', 'brilho'],
    ['↩', 'voltar'],
  ];
  if (appsEdit) {
    hint = [
      ['◀▶▲▼', 'navegar'],
      ['OK', 'marca / desmarca'],
      ['↩', 'pronto'],
    ];
    content = (
      <>
        <h2 className="tp-h">Aplicativos no Início · {myApps.length} escolhidos</h2>
        {(apps ?? []).length ? <div className="tp-row c6">{(apps ?? []).map((a, i) => appTile(a, true, i === 0))}</div> : <p className="tp-empty">Nenhum aplicativo encontrado.</p>}
        <p className="tp-note">Aparecem no Início na ordem em que você marca. Fica salvo nesta TV.</p>
      </>
    );
  } else if (tab === 'inicio') {
    content = (
      <>
        {chips}
        {panel && panel.scenes.length > 0 && (
          <>
            <h2 className="tp-h">Cenas rápidas</h2>
            <div className="tp-row c4">
              {panel.scenes.slice(0, 4).map((s, i) => {
                const Icon = SCENE_ICON[s.icon] ?? Sparkles;
                return (
                  <button key={s.id} className="tp-scene" {...F(`sc:${s.id}`, i === 0)} onClick={() => void runScene(s.id, s.name)}>
                    <span className="ic">
                      <Icon />
                    </span>
                    <span>
                      {s.name}
                      <small>{s.id === 'apagar' && lightsOn ? `${lightsOn} ${lightsOn === 1 ? 'acesa' : 'acesas'} agora` : s.hint}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {appsRow}
        <h2 className="tp-h">Luzes{panel?.favoritesAuto ? ' que você mais usa' : ' favoritas'}</h2>
        {favorites.length ? (
          <div className="tp-row c6">{favorites.map((d, i) => tile(d, !panel?.scenes.length && i === 0))}</div>
        ) : (
          <p className="tp-empty">{haConnected === false ? 'Home Assistant offline.' : panel ? 'Nenhuma luz encontrada.' : 'Carregando…'}</p>
        )}
        {camList.length > 0 && (
          <>
            <h2 className="tp-h">Câmeras</h2>
            <div className="tp-row c4">{camList.slice(0, 4).map((c, i) => camCard(c, i, 30_000))}</div>
          </>
        )}
      </>
    );
  } else if (tab === 'luzes') {
    const list = toggles.filter(isLightish);
    const groups = new Map<string, DeviceDto[]>();
    for (const d of list) groups.set(roomOf(d.name), [...(groups.get(roomOf(d.name)) ?? []), d]);
    const order = [...groups.keys()].sort((a, b) => Number(a === 'Outras') - Number(b === 'Outras') || a.localeCompare(b, 'pt-BR'));
    content = (
      <>
        <div className="tp-rooms">
          {order.map((room, gi) => (
            <section key={room}>
              <h2 className="tp-h">{room}</h2>
              <div className="tp-roomrow">{groups.get(room)!.map((d, i) => tile(d, gi === 0 && i === 0))}</div>
            </section>
          ))}
        </div>
        {!list.length && <p className="tp-empty">Nenhuma luz controlável.</p>}
        <p className="tp-note">Cômodo pelo nome do aparelho no Home Assistant.</p>
      </>
    );
  } else if (tab === 'cameras') {
    hint = [
      ['◀▶▲▼', 'escolher'],
      ['OK', 'abrir (imagens)'],
      ['⏯', 'abrir ao vivo'],
      ['↩', 'voltar'],
    ];
    content = camList.length ? (
      <div className="tp-row c3 tp-camgrid">{camList.map((c, i) => camCard(c, i, 15_000, i === 0))}</div>
    ) : (
      <p className="tp-empty">{cameras ? 'Nenhuma câmera.' : 'Carregando câmeras…'}</p>
    );
  } else {
    const others = toggles.filter((d) => !isLightish(d));
    const rain = nextRain(weather);
    content = (
      <>
        <h2 className="tp-h">Aparelhos</h2>
        <div className="tp-row c3">
          {(boxes ?? []).map((b, i) => (
            <button key={b.id} className={`tp-dev ${confirmClean === b.id ? 'ask' : ''}`} {...F(`litter:${b.id}`, i === 0)} onClick={() => b.canClean && void cleanBox(b.id)}>
              <span className="t">
                <Cat />
                {b.name}
              </span>
              <span className="d">
                {b.available ? b.statusLabel : 'indisponível'}
                {b.todayCount !== null ? ` · usada ${b.todayCount} ${b.todayCount === 1 ? 'vez' : 'vezes'} hoje` : ''}
              </span>
              {b.canClean && b.available && <span className="act">{confirmClean === b.id ? 'Aperte OK de novo para limpar' : 'OK = limpar agora'}</span>}
            </button>
          ))}
          {(washers ?? []).map((w) => {
            const total = w.startedAt && w.remainingMin !== null ? (Date.now() - Date.parse(w.startedAt)) / 60_000 + w.remainingMin : null;
            const pct = total && w.remainingMin !== null ? Math.round(100 * (1 - w.remainingMin / total)) : null;
            return (
              <button key={w.id} className="tp-dev" {...F(`washer:${w.id}`)} onClick={() => flash(w.running ? `${w.name}: ${w.statusLabel.toLowerCase()}${w.remainingMin !== null ? `, faltam ${w.remainingMin} min` : ''}` : `${w.name}: ${w.statusLabel.toLowerCase()}`)}>
                <span className="t">
                  <WashingMachine />
                  {w.name}
                </span>
                <span className="d">
                  {w.available ? w.statusLabel : 'indisponível'}
                  {w.running && w.endsAt ? ` · termina ${fmtTime(new Date(w.endsAt))}` : ''}
                  {w.running && w.remainingMin !== null ? ` · ${w.remainingMin} min` : ''}
                </span>
                {w.running && (
                  <span className="tp-bar wide">
                    <i style={{ width: `${Math.max(4, pct ?? 4)}%` }} />
                  </span>
                )}
              </button>
            );
          })}
          {vacuums.map((d) => {
            const v = d.vacuum!;
            const going = v.phase === 'cleaning' || v.phase === 'returning';
            return (
              <button key={d.entityId} className="tp-dev" {...F(`vac:${d.entityId}`)} onClick={() => d.available && void vacuum(d)}>
                <span className="t">
                  <Bot />
                  {d.name}
                </span>
                <span className="d">
                  {d.available ? v.status : 'indisponível'}
                  {v.battery !== null ? ` · ${v.battery}%` : ''}
                </span>
                {d.available && <span className="act">{going ? 'OK = voltar para a base' : 'OK = aspirar a casa'}</span>}
              </button>
            );
          })}
        </div>
        {others.length > 0 && (
          <>
            <h2 className="tp-h">Tomadas e outros</h2>
            <div className="tp-row c5">{others.map((d) => tile(d))}</div>
          </>
        )}
        {weather && (
          <>
            <h2 className="tp-h">Tempo</h2>
            <div className="tp-weather">
              <b>{Math.round(weather.current.temperature)}°</b>
              <span>
                {weather.current.condition} · mín {Math.round(weather.daily[0]?.min ?? 0)}° · máx {Math.round(weather.daily[0]?.max ?? 0)}°<br />
                <small>{rain ?? 'sem chuva nas próximas horas'}</small>
              </span>
            </div>
          </>
        )}
      </>
    );
  }

  const dateLine = `${cap(fmtDate(now))}${weather ? ` · ${Math.round(weather.current.temperature)}° ${weather.current.condition.toLowerCase()}` : ''}`;

  return (
    <div className="tp-root">
      <div ref={stageRef} className="tp-stage" style={{ transform: `translate(${stage.x}px, ${stage.y}px) scale(${stage.scale})` }}>
        {!camView && !saver && (
          <>
            <header className="tp-top">
              <div>
                <div className="tp-clock">{fmtTime(now)}</div>
                <div className="tp-date">{dateLine}</div>
              </div>
              <nav className="tp-tabs">
                {TABS.map((t) => (
                  <button key={t.id} className={`tp-tab ${tab === t.id ? 'on' : ''}`} {...F(`tab:${t.id}`)} onClick={() => goTab(t.id)}>
                    {t.id === 'inicio' && <Home />}
                    {t.id === 'cameras' && <Cctv />}
                    {t.label}
                  </button>
                ))}
                <button className="tp-tab icon" {...F('tab:exit')} onClick={() => setTvMode('off')} title="Visão do celular">
                  <Smartphone />
                </button>
              </nav>
            </header>
            <main className="tp-main" key={appsEdit ? "apps" : tab}>
              {content}
            </main>
            <Hint items={hint} />
          </>
        )}

        {camView && (
          <div className="tp-camfull">
            {cam ? <CameraPlayer key={`${cam.entityId}:${camView.live}`} camera={cam} imagesOnly={!camView.live} /> : <p className="tp-empty">{cameras ? 'Câmera não encontrada.' : 'Carregando…'}</p>}
            {cam && (
              <span className="tp-camname">
                {cam.name}
                <b className={camView.live ? 'live' : ''}>{camView.live ? 'ao vivo' : 'imagens'}</b>
              </span>
            )}
            {cam?.ptz && (
              <div className="tp-pad" aria-hidden="true">
                <i className={`u ${ptzDir === 'up' ? 'on' : ''}`}>▲</i>
                <i className={`d ${ptzDir === 'down' ? 'on' : ''}`}>▼</i>
                <i className={`l ${ptzDir === 'left' ? 'on' : ''}`}>◀</i>
                <i className={`r ${ptzDir === 'right' ? 'on' : ''}`}>▶</i>
              </div>
            )}
            <Hint
              items={[
                ...(cam?.ptz ? ([['◀▶▲▼', 'girar (segure)']] as [string, string][]) : camView.ids.length > 1 ? ([['◀▶', 'trocar câmera']] as [string, string][]) : []),
                ['OK', camView.live ? 'voltar às imagens (mais leve)' : 'ver ao vivo'],
                ['↩', 'voltar'],
              ]}
            />
          </div>
        )}

        {saver && <TvPhotoSaver now={now} weather={weather} lightsOn={lightsOn} who={who} recado={fresh.length ? (fresh.length === 1 ? `Recado novo de ${fresh[0]!.fromName}` : `${fresh.length} recados novos`) : null} photos={photoIds ?? []} />}
        {toast && <div className="tp-toast">{toast}</div>}
      </div>
    </div>
  );
}

/** Carrega a foto antes de mostrar (a troca nunca passa por tela vazia). Desiste após 8 s. */
function preload(src: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    setTimeout(() => resolve(false), 8000);
    img.src = src;
  });
}

let turn = 0;

/**
 * Protetor de tela da TV: as mesmas fotos do tablet, trocando a cada 15 s só com dissolve (sem movimento
 * de câmera, que pesa no Fire TV). No máximo duas fotos na tela. Sem fotos, mostra só o relógio.
 */
function TvPhotoSaver({ now, weather, lightsOn, who, recado, photos }: { now: Date; weather: WeatherDto | null; lightsOn: number; who: string | null; recado: string | null; photos: string[] }) {
  const [layers, setLayers] = useState<{ id: string; n: number; shown: boolean }[]>(() => (photos.length ? [{ id: photos[turn % photos.length]!, n: turn, shown: true }] : []));
  const [drift, setDrift] = useState(0);
  const list = useRef(photos);
  list.current = photos;
  useEffect(() => {
    if (!layers.length && photos.length) setLayers([{ id: photos[turn % photos.length]!, n: turn, shown: true }]);
  }, [photos.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    const next = async () => {
      const ids = list.current;
      if (ids.length < 2) return;
      const n = ++turn;
      const id = ids[n % ids.length]!;
      if (!(await preload(`/api/photos/${id}`)) || !alive) return;
      setLayers((l) => [...l.slice(-1), { id, n, shown: false }]);
      // entra no quadro seguinte (para a transição de opacidade acontecer) e a de baixo sai depois
      timers.push(window.setTimeout(() => alive && setLayers((l) => l.map((x) => (x.n === n ? { ...x, shown: true } : x))), 60));
      timers.push(window.setTimeout(() => alive && setLayers((l) => l.filter((x) => x.n === n)), FADE_MS + 300));
    };
    const t = setInterval(() => void next(), PHOTO_MS);
    const d = setInterval(() => setDrift((x) => (x + 1) % 4), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(d);
      timers.forEach(clearTimeout);
      turn++;
    };
  }, []);
  const rain = nextRain(weather);
  const offsets = ['0px, 0px', '18px, -12px', '-16px, 10px', '10px, 16px'];
  return (
    <div className={`tp-saver ${layers.length ? 'photos' : ''}`}>
      {layers.map((l) => (
        <img key={l.n} className={`tp-photo ${l.shown ? 'in' : ''}`} src={`/api/photos/${l.id}`} alt="" decoding="async" />
      ))}
      <div className="tp-shade" />
      <div className="tp-saver-info" style={{ transform: `translate(${offsets[drift]})` }}>
        <div>
          <p className="tp-saver-date">{cap(fmtDate(now))}</p>
          <p className="tp-saver-clock">{fmtTime(now)}</p>
          <p className="tp-saver-row">
            {weather && `${Math.round(weather.current.temperature)}° · ${rain ?? weather.current.condition.toLowerCase()}`}
            {weather && who ? '  |  ' : ''}
            {who}
          </p>
        </div>
        <div className="tp-saver-cards">
          {recado && <span className="tp-chip warn">{recado}</span>}
          {lightsOn > 0 && (
            <span className="tp-chip">
              <Lightbulb />
              {lightsOn === 1 ? '1 luz acesa' : `${lightsOn} luzes acesas`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
