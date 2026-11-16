import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Fan, Lightbulb, Plug, Power, Thermometer } from 'lucide-react';
import type { DeviceDto } from '@luna/shared/types';
import { useDevices } from '../stores/devices';
import { useSettings } from '../stores/settings';
import { DeviceArt, artKind, artTone } from './DeviceArt';

const iconFor = (d: DeviceDto) => (d.category === 'lighting' ? Lightbulb : d.category === 'outlets' ? Plug : d.category === 'climate' ? (d.entityId.startsWith('fan.') ? Fan : Thermometer) : Power);

/**
 * Brilho arrastando o dedo na barra do cartão. A luz acompanha enquanto arrasta (no máximo ~3 pedidos
 * por segundo) e o valor final vai ao soltar. Arrastar uma luz apagada já acende no nível escolhido.
 */
function BrightnessBar({ device, onLive }: { device: DeviceDto; onLive: (v: number | null) => void }) {
  const send = useDevices((s) => s.brightness);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const lastSent = useRef(0);
  const pending = useRef<number | null>(null);
  /** Último valor mandado (não repete o mesmo pedido) */
  const sentValue = useRef<number | null>(null);
  const push = (v: number) => {
    if (sentValue.current === v) return;
    sentValue.current = v;
    void send(device.entityId, v);
  };
  const value = drag ?? (device.isOn ? (device.brightness ?? 100) : 0);

  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(1, Math.min(100, Math.round(((clientX - r.left) / r.width) * 100)));
  };
  const live = (v: number) => {
    setDrag(v);
    onLive(v);
    const now = Date.now();
    if (now - lastSent.current > 350) {
      lastSent.current = now;
      push(v);
    } else pending.current = v;
  };
  const stop = (e: PointerEvent) => e.stopPropagation();
  const end = (v: number) => {
    push(v);
    pending.current = null;
    // segura o valor na tela até o estado novo chegar do Home Assistant
    setTimeout(() => {
      setDrag(null);
      onLive(null);
      sentValue.current = null;
    }, 900);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const v = Math.max(1, Math.min(100, value + (e.key === 'ArrowRight' ? 10 : -10)));
    setDrag(v);
    end(v);
  };

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={`Brilho de ${device.name}`}
      aria-valuemin={1}
      aria-valuemax={100}
      aria-valuenow={value}
      className={`m-dim ${drag !== null ? 'dragging' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={key}
      onPointerDown={(e) => {
        stop(e);
        e.currentTarget.setPointerCapture(e.pointerId);
        live(at(e.clientX));
      }}
      onPointerMove={(e) => {
        if (drag === null) return;
        stop(e);
        live(at(e.clientX));
      }}
      onPointerUp={(e) => {
        if (drag === null) return;
        stop(e);
        end(pending.current ?? at(e.clientX));
      }}
      onPointerCancel={() => drag !== null && end(drag)}
    >
      <div className="m-dim-track">
        <i style={{ width: `${value}%` }} />
        <b style={{ left: `${value}%` }} />
      </div>
    </div>
  );
}

/** Cartão de aparelho (tela inicial e Minha casa): toque liga/desliga; luz com brilho tem a barra de arrastar. */
export function DeviceTile({ device: d, index = 0 }: { device: DeviceDto; index?: number }) {
  const busy = useDevices((s) => s.busy[d.entityId]);
  const sereno = useSettings((s) => s.theme) === 'sereno';
  const [liveBrightness, setLiveBrightness] = useState<number | null>(null);
  useEffect(() => setLiveBrightness(null), [d.brightness]);
  const Icon = iconFor(d);
  const dimmable = d.supportsBrightness && d.available;
  const shownOn = liveBrightness !== null ? true : d.isOn === true;
  const pct = liveBrightness ?? (d.isOn ? d.brightness : null);
  const toggle = () => d.available && !busy && void useDevices.getState().toggle(d);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={d.isOn === true}
      aria-label={`${d.name}: ${d.isOn ? 'ligado' : 'desligado'}`}
      className={`m-card m-tile cursor-pointer select-none ${d.available ? '' : 'opacity-50'} ${sereno ? `sv-tile sv-${artTone(artKind(d))} ${shownOn ? 'is-on' : ''}` : ''}`}
      style={sereno ? { ['--i' as string]: Math.min(index, 12) } : undefined}
      onClick={toggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
    >
      <div className="flex items-center justify-between">
        {sereno ? (
          <DeviceArt device={d} on={shownOn} />
        ) : (
          <span className={`m-iconbox ${shownOn ? 'on' : ''}`}>
            <Icon className="h-5 w-5" />
          </span>
        )}
        <span className={`m-switch ${shownOn ? 'on' : ''}`} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{d.name}</p>
        <p className="m-muted text-[12.5px]">{!d.available ? 'Indisponível' : shownOn ? `Ligada${d.supportsBrightness && pct !== null ? ` · ${pct}%` : ''}` : 'Desligada'}</p>
      </div>
      {dimmable && <BrightnessBar device={d} onLive={setLiveBrightness} />}
    </div>
  );
}

/** Cartão de sensor (temperatura, umidade…): só mostra o valor */
export function SensorTile({ device: d }: { device: DeviceDto }) {
  return (
    <div className={`m-card m-tile ${d.available ? '' : 'opacity-50'}`}>
      <span className="m-iconbox">
        <Thermometer className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{d.name}</p>
        <p className="m-num text-xl">
          {d.available ? d.state : '—'}
          {d.available && d.unit && <span className="m-muted text-sm"> {d.unit}</span>}
        </p>
      </div>
    </div>
  );
}
