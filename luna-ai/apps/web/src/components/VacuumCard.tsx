import { useState } from 'react';
import { BatteryFull, BatteryLow, BatteryMedium, BatteryCharging, ChevronRight, Disc3, House, LocateFixed, Pause, Play, Wind } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DeviceDto, VacuumCommand } from '@luna/shared';
import { useDevices } from '../stores/devices';

/** Nomes de potência mais comuns (Xiaomi, Tuya/Neatsvor, Roborock…) em português. */
const FAN_LABEL: Record<string, string> = {
  silent: 'Silencioso',
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
    </div>
  );
}

/** Cartão “Aspiradores” da tela inicial (só aparece se houver robô no Home Assistant). */
export function VacuumCard() {
  const navigate = useNavigate();
  const devices = useDevices((s) => s.devices);
  const vacuums = Object.values(devices)
    .filter((d) => d.domain === 'vacuum' && !d.hidden)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (!vacuums.length) return null;
  return (
    <div className="m-card" style={{ padding: 16 }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="m-label">{vacuums.length === 1 ? 'Aspirador' : 'Aspiradores'}</p>
        <button className="m-muted flex items-center text-xs" onClick={() => navigate('/casa?f=vacuum')}>
          ajustar <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-4">
        {vacuums.map((d, i) => (
          <div key={d.entityId} className={i ? 'border-t border-white/5 pt-4' : ''}>
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Disc3 className={`h-4 w-4 ${d.vacuum?.phase === 'cleaning' ? 'animate-spin [animation-duration:2.5s]' : 'opacity-70'}`} /> {d.name}
            </p>
            <VacuumControls device={d} />
          </div>
        ))}
      </div>
    </div>
  );
}
