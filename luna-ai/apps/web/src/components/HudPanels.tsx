import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Droplets, Thermometer, Umbrella, Wind } from 'lucide-react';
import type { AssistantState, AutomationRuleDto, CameraDto, HealthDto, WeatherDto } from '@luna/shared/types';
import { useDevices } from '../stores/devices';
import type { UiMessage } from '../stores/assistant';
import { ExpandablePanel } from './Expandable';
import { DevicesPanel, SensorsPanel } from './Dashboard';
import { MessageList } from './Messages';
import { WeatherIcon } from './WeatherIcon';
import { CameraPlayer, CameraThumb } from './CameraPlayer';
import { CameraControls } from './CameraViewer';

const round = (n: number) => Math.round(n);

function Bar({ label, value, text, warn }: { label: string; value: number; text: string; warn?: boolean }) {
  return (
    <div className="font-hud my-2 grid grid-cols-[92px_1fr_44px] items-center gap-2 text-[11px] tracking-[0.14em] text-cyan-100/70 uppercase">
      <span className="truncate">{label}</span>
      <div className="h-1.5 bg-cyan-300/12">
        <div
          className={`h-full ${warn ? 'bg-rose-400 shadow-[0_0_8px_#fb7185]' : 'bg-gradient-to-r from-cyan-600 to-cyan-300 shadow-[0_0_8px_#00e5ff]'}`}
          style={{ width: `${Math.max(3, Math.min(100, value))}%` }}
        />
      </div>
      <span className="hud-title text-right text-[11px] text-cyan-50">{text}</span>
    </div>
  );
}

/* ---------------- Status do sistema ---------------- */
export function StatusPanel({ health, server, ha, mini }: { health: HealthDto | null; server: boolean; ha: boolean | null; mini?: boolean }) {
  const sys = health?.system;
  const ollama = health?.services.ollama;
  const allOk = server && ha !== false && (ollama?.ok ?? true);
  return (
    <ExpandablePanel
      title={mini ? 'Sistema' : 'Status do sistema'}
      code={mini ? undefined : 'S-01'}
      className={mini ? 'p-3 text-center' : ''}
      expanded={() => (
        <div className="space-y-4">
          <div>
            <Bar label="Home Assist." value={ha ? 100 : 0} text={ha ? 'ON' : 'OFF'} warn={ha === false} />
            <Bar label="IA local" value={ollama?.ok ? 100 : 0} text={ollama?.ok ? 'ON' : 'OFF'} warn={!ollama?.ok} />
            <Bar label="CPU" value={sys?.cpuPercent ?? 0} text={`${sys?.cpuPercent ?? 0}%`} warn={(sys?.cpuPercent ?? 0) > 90} />
            <Bar label="Memória" value={sys?.memoryPercent ?? 0} text={`${sys?.memoryPercent ?? 0}%`} warn={(sys?.memoryPercent ?? 0) > 90} />
          </div>
          <ul className="font-hud divide-y divide-cyan-300/10 text-sm">
            {[
              ['Servidor da Luna', server, server ? `online · ativo há ${round((health?.uptimeSeconds ?? 0) / 60)} min` : 'sem conexão'],
              ['Home Assistant', ha, health?.services.homeAssistant.detail ?? '—'],
              ['IA local (Ollama)', ollama?.ok ?? null, ollama ? `${ollama.model} · ${ollama.detail}` : '—'],
              ['IA na nuvem (OpenAI)', health?.services.openai.configured ? health.services.openai.ok : null, health?.services.openai.configured ? health.services.openai.detail : 'desligada (opcional)'],
              ['Banco de dados', health?.services.database.ok ?? null, health?.services.database.detail ?? '—'],
            ].map(([name, ok, detail]) => (
              <li key={String(name)} className="flex items-center justify-between gap-3 py-2">
                <span className="text-cyan-100/80">{name}</span>
                <span className="flex items-center gap-2 text-right text-xs text-cyan-100/55">
                  {String(detail)}
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ok === null ? 'bg-cyan-100/30' : ok ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
                </span>
              </li>
            ))}
          </ul>
          {sys && (
            <p className="font-hud text-xs text-cyan-100/45">
              Memória {sys.memoryUsedGb} de {sys.memoryTotalGb} GB · servidor ligado há {sys.serverUptimeHours} h · versão {health?.version}
            </p>
          )}
        </div>
      )}
    >
      {mini ? (
        <>
          <p className={`hud-title text-lg font-bold ${allOk ? 'text-emerald-300' : 'text-rose-300'}`}>{allOk ? 'OK' : '!'}</p>
          <p className="hud-label text-[9px] text-cyan-300/60">CPU {sys?.cpuPercent ?? '—'}%</p>
        </>
      ) : (
        <>
          <Bar label="Home Assist." value={ha ? 100 : 0} text={ha ? 'ON' : 'OFF'} warn={ha === false} />
          <Bar label="IA local" value={ollama?.ok ? 100 : 0} text={ollama?.ok ? 'ON' : 'OFF'} warn={!ollama?.ok} />
          <Bar label="CPU" value={sys?.cpuPercent ?? 0} text={sys ? `${sys.cpuPercent}%` : '—'} />
          <Bar label="Memória" value={sys?.memoryPercent ?? 0} text={sys ? `${sys.memoryPercent}%` : '—'} />
        </>
      )}
    </ExpandablePanel>
  );
}

/* ---------------- Ambiente (clima) ---------------- */
function EnvTiles({ w }: { w: WeatherDto }) {
  const tiles = [
    [`${round(w.current.temperature)}°`, w.current.condition],
    [`${w.current.humidity}%`, 'Umidade'],
    [`${w.daily[0]?.precipitationProbability ?? 0}%`, 'Chuva hoje'],
    [`${round(w.current.windSpeed)}`, 'km/h vento'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map(([v, l]) => (
        <div key={l} className="border border-cyan-300/15 bg-cyan-400/[0.03] px-2.5 py-2">
          <p className="hud-title text-lg font-bold text-cyan-50">{v}</p>
          <p className="hud-label truncate text-[9px] text-cyan-300/60">{l}</p>
        </div>
      ))}
    </div>
  );
}

export function EnvPanel({ weather, mini }: { weather: WeatherDto | null; mini?: boolean }) {
  return (
    <ExpandablePanel
      title={mini ? 'Clima' : 'Ambiente'}
      code={mini ? undefined : 'W-02'}
      className={mini ? 'p-3 text-center' : ''}
      expanded={() =>
        weather ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <WeatherIcon code={weather.current.weatherCode} isDay={weather.current.isDay} className="h-16 w-16" />
              <div>
                <p className="hud-title hud-glow text-5xl font-bold text-cyan-50">{round(weather.current.temperature)}°</p>
                <p className="font-hud text-cyan-100/75">
                  {weather.current.condition} · sensação {round(weather.current.apparentTemperature)}°
                </p>
              </div>
            </div>
            <div className="font-hud grid grid-cols-3 gap-2 text-sm text-cyan-100/75">
              <span className="flex items-center gap-1.5"><Droplets className="h-4 w-4 text-cyan-300" /> {weather.current.humidity}%</span>
              <span className="flex items-center gap-1.5"><Wind className="h-4 w-4 text-cyan-300" /> {round(weather.current.windSpeed)} km/h</span>
              <span className="flex items-center gap-1.5"><Umbrella className="h-4 w-4 text-cyan-300" /> {weather.daily[0]?.precipitationProbability ?? 0}%</span>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {weather.hourly.slice(0, 12).map((h) => (
                <div key={h.time} className="flex w-14 shrink-0 flex-col items-center gap-1 border border-cyan-300/15 bg-ink-900/60 py-2 text-xs">
                  <span className="text-cyan-100/50">{h.time.slice(11, 16)}</span>
                  <WeatherIcon code={h.weatherCode} className="h-5 w-5" />
                  <span className="hud-title text-cyan-50">{round(h.temperature)}°</span>
                  <span className={h.precipitationProbability >= 40 ? 'text-sky-300' : 'text-cyan-100/35'}>{h.precipitationProbability}%</span>
                </div>
              ))}
            </div>
            <ul className="divide-y divide-cyan-300/10">
              {weather.daily.map((d, i) => (
                <li key={d.date} className="font-hud flex items-center gap-3 py-2 text-sm">
                  <span className="w-16 text-cyan-100/70 capitalize">{i === 0 ? 'Hoje' : new Date(`${d.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                  <WeatherIcon code={d.weatherCode} className="h-5 w-5" />
                  <span className="flex-1 truncate text-cyan-100/55">{d.condition}</span>
                  <span className={`w-10 text-right ${d.precipitationProbability >= 40 ? 'text-sky-300' : 'text-cyan-100/35'}`}>{d.precipitationProbability}%</span>
                  <span className="w-16 text-right"><span className="text-cyan-100/40">{round(d.min)}°</span> {round(d.max)}°</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="font-hud text-cyan-100/60">Defina a localização em Ajustes para ver a previsão.</p>
        )
      }
    >
      {mini ? (
        <>
          <p className="hud-title text-lg font-bold text-cyan-50">{weather ? `${round(weather.current.temperature)}°` : '—'}</p>
          <p className="hud-label truncate text-[9px] text-cyan-300/60">{weather ? `chuva ${weather.daily[0]?.precipitationProbability ?? 0}%` : 'clima'}</p>
        </>
      ) : weather ? (
        <EnvTiles w={weather} />
      ) : (
        <p className="font-hud text-sm text-cyan-100/50">Sincronizando clima…</p>
      )}
    </ExpandablePanel>
  );
}

/* ---------------- Assistente de voz ---------------- */
export function VoicePanel({ messages, state }: { messages: UiMessage[]; state: AssistantState }) {
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  const active = state === 'speaking' || state === 'listening';
  return (
    <ExpandablePanel
      title="Assistente de voz"
      code="V-03"
      expanded={() => (
        <div>
          {messages.length ? <MessageList messages={messages} /> : <p className="font-hud text-cyan-100/60">Nenhuma conversa nesta sessão. Diga “Ei, Luna” ou toque no globo.</p>}
          <Link to="/conversas" className="hud-label mt-4 inline-block text-cyan-300/70 hover:text-cyan-200" data-no-expand>
            ver histórico completo ›
          </Link>
        </div>
      )}
    >
      <p className="hud-label text-[9px] text-cyan-300/50">{last ? 'Última resposta' : 'Pronta para ouvir'}</p>
      <p className="mt-1 line-clamp-2 text-sm text-cyan-50/90">{last?.content ?? 'Diga “Ei, Luna” ou toque no globo para falar.'}</p>
      <div className={`voice-wave mt-2 flex h-10 items-center gap-[3px] ${active ? 'is-active' : ''}`} aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => (
          <i key={i} style={{ height: `${18 + Math.abs(Math.sin(i * 0.45) * Math.cos(i * 0.13)) * 82}%`, animationDelay: `${(i % 9) * 70}ms` }} />
        ))}
      </div>
    </ExpandablePanel>
  );
}

/* ---------------- Localização (cidade 3D) ---------------- */
function City({ big = false }: { big?: boolean }) {
  const svg = useMemo(() => {
    let out = '';
    const iso = (gx: number, gy: number, z: number) => [135 + (gx - gy) * 14, 40 + (gx + gy) * 7 - z];
    for (let gx = 0; gx < 8; gx++)
      for (let gy = 0; gy < 8; gy++) {
        const h = 4 + ((gx * 7 + gy * 13) % 9) * 4 + (gx === 4 && gy === 3 ? 24 : 0);
        const p = (a: number, b: number, z: number) => iso(a, b, z).join(',');
        const top = [p(gx, gy, h), p(gx + 0.8, gy, h), p(gx + 0.8, gy + 0.8, h), p(gx, gy + 0.8, h)].join(' ');
        const left = [p(gx, gy + 0.8, h), p(gx + 0.8, gy + 0.8, h), p(gx + 0.8, gy + 0.8, 0), p(gx, gy + 0.8, 0)].join(' ');
        const right = [p(gx + 0.8, gy, h), p(gx + 0.8, gy + 0.8, h), p(gx + 0.8, gy + 0.8, 0), p(gx + 0.8, gy, 0)].join(' ');
        out += `<polygon points="${left}" fill="rgba(0,120,170,.25)" stroke="#00e5ff" stroke-opacity=".5" stroke-width=".6"/><polygon points="${right}" fill="rgba(0,80,130,.25)" stroke="#00e5ff" stroke-opacity=".5" stroke-width=".6"/><polygon points="${top}" fill="rgba(0,229,255,.18)" stroke="#00e5ff" stroke-width=".7"/>`;
      }
    const [px, py] = iso(4.4, 3.4, 70);
    out += `<g class="city-pin"><path d="M${px} ${py! + 22} c-8 -10 -11 -15 -11 -21 a11 11 0 0 1 22 0 c0 6 -3 11 -11 21z" fill="#00e5ff"/><circle cx="${px}" cy="${py}" r="4" fill="#01050a"/></g>`;
    return out;
  }, []);
  return <svg viewBox="0 0 270 150" className={`w-full ${big ? 'h-64' : 'h-32'}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function LocationPanel({ place, coords }: { place: string; coords: string | null }) {
  return (
    <ExpandablePanel
      title="Localização"
      code="L-04"
      expanded={() => (
        <div className="space-y-3">
          <City big />
          <p className="hud-title text-lg text-cyan-50">{place}</p>
          {coords && <p className="font-hud text-sm text-cyan-100/55">{coords}</p>}
          <p className="font-hud text-xs text-cyan-100/40">Mapa ilustrativo. A localização é usada só para o clima e não é armazenada (exceto a de casa, se você definir).</p>
          <Link to="/configuracoes" className="hud-label inline-block text-cyan-300/70 hover:text-cyan-200" data-no-expand>
            alterar em Ajustes ›
          </Link>
        </div>
      )}
    >
      <City />
      <p className="hud-label mt-1 truncate text-[10px] text-cyan-300/70">{place}</p>
    </ExpandablePanel>
  );
}

/* ---------------- Rotina de hoje (automações) ---------------- */
const describeTrigger = (r: AutomationRuleDto) => r.name;

export function RoutinePanel({ rules }: { rules: AutomationRuleDto[] | null }) {
  const list = rules ?? [];
  const Item = ({ r }: { r: AutomationRuleDto }) => (
    <li className="flex items-center gap-2.5 py-1.5 text-sm text-cyan-50/85">
      <span className={`h-2.5 w-2.5 shrink-0 rotate-45 border-[1.5px] border-cyan-300 ${r.status === 'active' ? 'bg-cyan-300 shadow-[0_0_8px_#00e5ff]' : ''}`} />
      <span className="truncate">{describeTrigger(r)}</span>
    </li>
  );
  return (
    <ExpandablePanel
      title="Rotina de hoje"
      code="R-05"
      expanded={() => (
        <div>
          {list.length ? (
            <ul className="divide-y divide-cyan-300/10">
              {list.map((r) => (
                <li key={r.id} className="py-2.5">
                  <p className="text-cyan-50">{r.name}</p>
                  <p className="font-hud text-xs text-cyan-100/55">{r.description}</p>
                  <p className={`hud-label mt-1 text-[9px] ${r.status === 'active' ? 'text-emerald-300' : r.status === 'error' ? 'text-rose-300' : 'text-amber-200'}`}>
                    {r.status === 'active' ? 'ativa' : r.status === 'disabled' ? 'desativada' : r.status === 'draft' ? 'rascunho' : 'erro'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-hud text-cyan-100/60">Nenhuma automação ainda. Peça: “Luna, crie uma automação para desligar as luzes às 23h”.</p>
          )}
          <Link to="/automacoes" className="hud-label mt-4 inline-block text-cyan-300/70 hover:text-cyan-200" data-no-expand>
            gerenciar automações ›
          </Link>
        </div>
      )}
    >
      {rules === null ? (
        <p className="font-hud text-sm text-cyan-100/50">Carregando…</p>
      ) : list.length ? (
        <ul>
          {list.slice(0, 3).map((r) => (
            <Item key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        <p className="font-hud text-sm text-cyan-100/50">Nenhuma automação.</p>
      )}
    </ExpandablePanel>
  );
}

/* ---------------- Casa ---------------- */
export function HomeRingPanel({ mini }: { mini?: boolean } = {}) {
  const devices = useDevices((s) => s.devices);
  const all = Object.values(devices).filter((d) => d.controllable && !d.hidden);
  const on = all.filter((d) => d.isOn);
  const pct = all.length ? on.length / all.length : 0;
  const chips = [...on, ...all.filter((d) => !d.isOn)].slice(0, 4);
  return (
    <ExpandablePanel
      title="Casa"
      code={mini ? undefined : 'H-06'}
      className={mini ? 'p-3 text-center' : ''}
      expanded={() => (
        <div className="space-y-4" data-no-expand>
          <DevicesPanel />
          <SensorsPanel />
        </div>
      )}
    >
      {mini ? (
        <>
          <p className="hud-title text-lg font-bold text-amber-200 [text-shadow:0_0_10px_rgba(255,181,71,0.6)]">
            {on.length}/{all.length}
          </p>
          <p className="hud-label text-[9px] text-cyan-300/60">ativos</p>
        </>
      ) : (
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(0,229,255,.15)" strokeWidth="8" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#ffb547" strokeWidth="8" strokeDasharray={`${pct * 251} 252`} transform="rotate(-90 50 50)" style={{ filter: 'drop-shadow(0 0 5px #ffb547)' }} />
          <text x="50" y="52" textAnchor="middle" fill="#fff" style={{ font: '700 17px Orbitron' }}>
            {on.length}/{all.length}
          </text>
          <text x="50" y="68" textAnchor="middle" fill="#00e5ff" style={{ font: '600 8px Rajdhani', letterSpacing: '2px' }}>
            ATIVOS
          </text>
        </svg>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
          {chips.map((d) => (
            <span key={d.entityId} className={`font-hud truncate border px-1.5 py-1 text-[11px] ${d.isOn ? 'border-amber-300/60 text-amber-100 shadow-[0_0_8px_rgba(255,181,71,0.2)]' : 'border-cyan-300/15 text-cyan-100/60'}`}>
              {d.name}
            </span>
          ))}
        </div>
      </div>
      )}
    </ExpandablePanel>
  );
}

/* ---------------- Câmeras ---------------- */
export function CamerasPanel({ cameras }: { cameras: CameraDto[] }) {
  const first = cameras[0];
  if (!first) return null;
  return (
    <ExpandablePanel
      title="Câmeras"
      code="C-07"
      expanded={() => <CameraExpanded cameras={cameras} />}
    >
      <CameraThumb camera={first} className="aspect-video w-full" everyMs={10_000} />
      <p className="hud-label mt-2 truncate text-[10px] text-cyan-300/70">
        {first.name}
        {cameras.length > 1 ? ` · +${cameras.length - 1}` : ''}
      </p>
    </ExpandablePanel>
  );
}

function CameraExpanded({ cameras }: { cameras: CameraDto[] }) {
  const [current, setCurrent] = useState(cameras[0]!.entityId);
  const box = useRef<HTMLDivElement>(null);
  const cam = cameras.find((c) => c.entityId === current) ?? cameras[0]!;
  return (
    <div className="space-y-3">
      <div ref={box}>
        <CameraPlayer key={cam.entityId} camera={cam} className="aspect-video w-full" />
      </div>
      <CameraControls camera={cam} containerRef={box} />
      {cameras.length > 1 && (
        <div className="grid grid-cols-3 gap-2">
          {cameras.map((c) => (
            <button key={c.entityId} onClick={() => setCurrent(c.entityId)} className={`overflow-hidden rounded-sm border ${c.entityId === cam.entityId ? 'border-cyan-300' : 'border-cyan-300/20'}`}>
              <CameraThumb camera={c} className="aspect-video" />
              <p className="font-hud truncate px-1 py-0.5 text-[10px] text-cyan-100/70">{c.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
