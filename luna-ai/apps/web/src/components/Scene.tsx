import { useMemo } from 'react';

/**
 * Cenário 3D estático (desenhado uma vez; não custa nada por quadro):
 * silhueta de cidade noturna, piso quadriculado em perspectiva e moldura iluminada.
 */
export function Scene() {
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
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="scene-glow" />
      <svg className="scene-skyline" viewBox="0 0 1200 300" preserveAspectRatio="none" dangerouslySetInnerHTML={{ __html: skyline }} />
      <div className="scene-floor" />
    </div>
  );
}

/** Moldura iluminada nas bordas (cantos angulados). */
export function Bezel() {
  return (
    <>
      <svg className="bezel pointer-events-none fixed inset-0 z-[5] hidden h-full w-full md:block" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="#00e5ff" strokeWidth="1.4" vectorEffect="non-scaling-stroke" opacity=".8">
          <path d="M10 60 V20 L30 6 H330 M670 6 H970 L990 20 V60" vectorEffect="non-scaling-stroke" />
          <path d="M10 540 V580 L30 594 H300 M700 594 H970 L990 580 V540" vectorEffect="non-scaling-stroke" />
          <path d="M4 150 V450 M996 150 V450" opacity=".45" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <i className="bezel-corner left-2 border-t-2 border-l-2 md:hidden" aria-hidden="true" />
      <i className="bezel-corner right-2 border-t-2 border-r-2 md:hidden" aria-hidden="true" />
    </>
  );
}
