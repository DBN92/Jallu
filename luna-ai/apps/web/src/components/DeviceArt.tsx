import { Plug, Power, Thermometer } from 'lucide-react';
import type { DeviceDto } from '@luna/shared/types';

export type ArtKind = 'fan' | 'led' | 'light' | 'outlet' | 'climate' | 'other';

export function artKind(d: DeviceDto): ArtKind {
  if (d.entityId.startsWith('fan.') || /ventilador/i.test(d.name)) return 'fan';
  if (d.category === 'lighting') return /\b(led|fita)\b/i.test(d.name) ? 'led' : 'light';
  if (d.category === 'outlets' || d.category === 'switches') return 'outlet';
  if (d.category === 'climate') return 'climate';
  return 'other';
}

/** Tom do cartão ligado: quente (luz), frio (ventilador/clima) ou colorido (fita de LED). */
export const artTone = (k: ArtKind) => (k === 'fan' || k === 'climate' ? 'cool' : k === 'led' ? 'led' : 'warm');

const BLADE = 'M32 32c-2-10 0-21 7-22 6 0 5 12-7 22z';

/**
 * Desenho animado do aparelho (tema Sereno). Para não pesar no tablet, o que se mexe são
 * elementos inteiros girando ou esmaecendo (transform/opacity), nunca o desenho sendo refeito.
 */
export function DeviceArt({ device, on }: { device: DeviceDto; on: boolean }) {
  const kind = artKind(device);
  if (kind === 'fan')
    return (
      <span className={`sv-art sv-fan ${on ? 'on' : ''}`} aria-hidden>
        <span className="sv-wind">
          <i />
          <i />
          <i />
        </span>
        <span className="sv-fan-ring" />
        <svg className="sv-blades sv-anim" viewBox="0 0 64 64">
          <path d={BLADE} />
          <path d={BLADE} transform="rotate(120 32 32)" />
          <path d={BLADE} transform="rotate(240 32 32)" />
        </svg>
        <span className="sv-hub" />
      </span>
    );
  if (kind === 'light' || kind === 'led')
    return (
      <span className={`sv-art sv-bulb ${kind === 'led' ? 'led' : ''} ${on ? 'on' : ''}`} aria-hidden>
        <span className="sv-halo sv-anim" />
        <svg viewBox="0 0 64 64">
          <path className="sv-glass" d="M32 10a14 14 0 0 0-8 25.5V40h16v-4.5A14 14 0 0 0 32 10z" />
          <rect x="25" y="42" width="14" height="4" rx="2" fill="#4b5263" />
          <rect x="27" y="48" width="10" height="4" rx="2" fill="#4b5263" />
        </svg>
      </span>
    );
  const Icon = kind === 'outlet' ? Plug : kind === 'climate' ? Thermometer : Power;
  return (
    <span className={`sv-art sv-plain ${on ? 'on' : ''}`} aria-hidden>
      <span className="sv-halo sv-anim" />
      <Icon className="relative h-6 w-6" />
    </span>
  );
}
