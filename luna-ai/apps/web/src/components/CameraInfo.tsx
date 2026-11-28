import { Baby, BatteryMedium, Droplets, EyeOff, Moon, Thermometer, Volume2, Activity, Info } from 'lucide-react';
import type { CameraInfoItem } from '@luna/shared/types';

const ICON: Record<CameraInfoItem['kind'], typeof Info> = {
  temperature: Thermometer,
  humidity: Droplets,
  battery: BatteryMedium,
  cry: Baby,
  sound: Volume2,
  motion: Activity,
  privacy: EyeOff,
  night: Moon,
  other: Info,
};

/** O que o aparelho da câmera informa (babá eletrônica): temperatura, umidade, choro, som, movimento… */
export function CameraInfo({ info, compact }: { info?: CameraInfoItem[]; compact?: boolean }) {
  if (!info?.length) return null;
  const list = compact ? info.filter((i) => i.active || ['temperature', 'humidity'].includes(i.kind)).slice(0, 3) : info;
  if (!list.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'justify-center md:justify-start'}`}>
      {list.map((i) => {
        const Icon = ICON[i.kind];
        return (
          <span
            key={i.entityId}
            title={i.label}
            className={`font-hud inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${compact ? 'text-[11px]' : 'text-xs'} ${
              i.active ? 'animate-pulse border-amber-300/70 bg-amber-400/20 text-amber-50' : 'border-cyan-300/20 bg-ink-900/70 text-cyan-50'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${i.active ? 'text-amber-300' : 'text-cyan-300/80'}`} />
            {!compact && <span className="text-cyan-100/55">{i.label}:</span>}
            <b className="font-semibold">{i.value}</b>
          </span>
        );
      })}
    </div>
  );
}
