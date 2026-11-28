import { useState } from 'react';
import { RobotImage } from './RobotImage';
import { BatteryFull, BatteryLow, BatteryMedium, BatteryCharging, ChevronRight, House, LocateFixed, Pause, Play, Wind } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DeviceDto, VacuumCommand } from '@luna/shared';
import { useDevices } from '../stores/devices';

/** Nomes de potência mais comuns (Xiaomi, Tuya/Neatsvor, Roborock…) em português. */
const FAN_LABEL: Record<string, string> = {
  silent: 'Silencioso',
  basic: 'Básica',
  'full speed': 'Máxima',
  quiet: 'Silencioso',
  gentle: 'Suave',
  low: 'Baixa',
  eco: 'Econômico',
  standard: 'Padrão',
  normal: 'Padrão',
  balanced: 'Equilibrado',
  medium: 'Média',
  middle: 'Média',
  strong: 'Forte',
  high: 'Alta',
  turbo: 'Turbo',
  max: 'Máxima',
  'max+': 'Máxima+',
  strong_2: 'Máxima',
  off: 'Desligada',
};
export const fanLabel = (s: string) => FAN_LABEL[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1);

const batteryIcon = (v: DeviceDto['vacuum']) => {
  if (!v || v.battery === null) return null;
  if (v.phase === 'docked' && v.battery < 100) return BatteryCharging;
  return v.battery >= 70 ? BatteryFull : v.battery >= 30 ? BatteryMedium : BatteryLow;
};

const phaseColor: Record<string, string> = {
  cleaning: 'bg-cyan-400/15 text-cyan-100',
  returning: 'bg-violet-400/15 text-violet-100',
  paused: 'bg-amber-400/15 text-amber-100',
  error: 'bg-rose-400/20 text-rose-100',
};

/** Situação, bateria e botões de um aspirador robô (usado na tela inicial e em “Minha casa”). */
export function VacuumControls({ device }: { device: DeviceDto }) {
  const navigate = useNavigate();
  const vacuum = useDevices((s) => s.vacuum);
  const busy = useDevices((s) => s.busy[device.entityId]);
  const [error, setError] = useState<string | null>(null);
  const [showFan, setShowFan] = useState(false);
  const v = device.vacuum;
  if (!v) return null;
  const Battery = batteryIcon(v);
  const run = async (cmd: VacuumCommand, fan?: string) => {
    setError(null);
    const err = await vacuum(device.entityId, cmd, fan);
    setError(err);
    if (!err && cmd === 'set_fan_speed') setShowFan(false);
  };
  const off = !device.available || busy;
  const cleaning = v.phase === 'cleaning';
  const btn = 'm-chip justify-center disabled:opacity-40';

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${phaseColor[v.phase] ?? 'bg-white/10 text-white/70'}`}>{device.available ? v.status : 'Indisponível'}</span>
        {Battery && (
          <span className={`flex items-center gap-1 text-xs ${v.battery! < 20 ? 'text-rose-300' : 'm-muted text-white/60'}`}>
            <Battery className="h-4 w-4" /> {v.battery}%
          </span>
        )}
        {v.fanSpeed && (
          <span className="m-muted flex items-center gap-1 text-xs text-white/60">
            <Wind className="h-3.5 w-3.5" /> {fanLabel(v.fanSpeed)}
          </span>
        )}
      </div>
      {v.error && <p className="text-xs text-rose-300">Aviso do robô: {v.error}</p>}
      <div className="flex flex-wrap gap-2">
        {cleaning ? (
          <button className={btn} disabled={off} onClick={() => void run('pause')}>
            <Pause className="h-4 w-4" /> Pausar
          </button>
        ) : (
          <button className={`${btn} act`} disabled={off} onClick={() => void run('start')}>
            <Play className="h-4 w-4" /> {v.phase === 'paused' ? 'Continuar' : 'Aspirar'}
          </button>
        )}
        {v.can.returnHome && v.phase !== 'docked' && (
          <button className={btn} disabled={off} onClick={() => void run('return_to_base')}>
            <House className="h-4 w-4" /> Base
          </button>
        )}
        {v.can.locate && (
          <button className={btn} disabled={off} onClick={() => void run('locate')} aria-label={`Fazer ${device.name} apitar`} title="Apitar para encontrar">
            <LocateFixed className="h-4 w-4" />
          </button>
        )}
        {v.can.fanSpeed && (
          <button className={`${btn} ${showFan ? 'act' : ''}`} disabled={off} onClick={() => setShowFan((x) => !x)} aria-label="Potência de sucção" title="Potência">
            <Wind className="h-4 w-4" />
          </button>
        )}
      </div>
      {showFan && (
        <div className="flex flex-wrap gap-1.5">
          {v.fanSpeeds.map((f) => (
            <button key={f} className={`m-chip ${f === v.fanSpeed ? 'act' : ''}`} style={{ padding: '6px 12px', fontSize: 13 }} disabled={off} onClick={() => void run('set_fan_speed', f)}>
              {fanLabel(f)}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <button className="m-muted flex items-center text-xs opacity-80" onClick={() => navigate(`/aspirador/${device.entityId}`)}>
        Mais opções <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Cartão “Aspiradores” da tela inicial: imagem do robô, situação e os comandos principais. Toque para a tela completa. */
export function VacuumCard() {
  const navigate = useNavigate();
  const devices = useDevices((s) => s.devices);
  const vacuum = useDevices((s) => s.vacuum);
  const busy = useDevices((s) => s.busy);
  const [error, setError] = useState<string | null>(null);
  const vacuums = Object.values(devices)
    .filter((d) => d.domain === 'vacuum' && !d.hidden)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (!vacuums.length) return null;
  const run = async (d: DeviceDto, cmd: VacuumCommand) => setError(await vacuum(d.entityId, cmd));
  return (
    <div className="m-card" style={{ padding: 16 }}>
      <p className="m-label mb-3">{vacuums.length === 1 ? 'Aspirador' : 'Aspiradores'}</p>
      <div className="space-y-4">
        {vacuums.map((d, i) => {
          const v = d.vacuum!;
          const Battery = batteryIcon(v);
          const cleaning = v.phase === 'cleaning';
          const off = !d.available || busy[d.entityId];
          const open = () => navigate(`/aspirador/${d.entityId}`);
          return (
            <div key={d.entityId} className={i ? 'border-t border-white/5 pt-4' : ''}>
              <button className="flex w-full items-center gap-3 text-left" onClick={open} aria-label={`Abrir ${d.name}`}>
                <span className={cleaning ? 'animate-[spin_6s_linear_infinite]' : ''}>
                  <RobotImage device={d} size={58} glow={cleaning ? 'var(--accent-1)' : undefined} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold">{d.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${phaseColor[v.phase] ?? 'bg-white/10 text-white/70'}`}>{d.available ? v.status : 'Indisponível'}</span>
                    {Battery && (
                      <span className={`flex items-center gap-1 text-xs ${v.battery! < 20 ? 'text-rose-300' : 'm-muted'}`}>
                        <Battery className="h-4 w-4" /> {v.battery}%
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight className="m-muted h-5 w-5 shrink-0" />
              </button>
              <div className="mt-3 flex gap-2">
                {cleaning ? (
                  <button className="m-chip flex-1 justify-center disabled:opacity-40" disabled={off} onClick={() => void run(d, 'pause')}>
                    <Pause className="h-4 w-4" /> {v.can.pause ? 'Pausar' : 'Parar'}
                  </button>
                ) : (
                  <button className="m-chip act flex-1 justify-center disabled:opacity-40" disabled={off} onClick={() => void run(d, 'start')}>
                    <Play className="h-4 w-4" /> {v.phase === 'paused' ? 'Continuar' : 'Iniciar limpeza'}
                  </button>
                )}
                {v.can.returnHome && v.phase !== 'docked' && (
                  <button className="m-chip justify-center disabled:opacity-40" disabled={off} onClick={() => void run(d, 'return_to_base')}>
                    <House className="h-4 w-4" /> Base
                  </button>
                )}
                <button className="m-chip justify-center" onClick={open}>
                  Mais opções
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
