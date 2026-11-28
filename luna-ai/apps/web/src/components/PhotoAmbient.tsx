import { isSereno } from '../lib/theme';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloudSun, Lightbulb, Video } from 'lucide-react';
import type { WeatherDto } from '@luna/shared/types';
import { useDevices } from '../stores/devices';
import { usePhotos } from '../stores/photos';
import { usePeople } from '../stores/people';
import { unseenRecados, useRecados } from '../stores/recados';
import { useSettings } from '../stores/settings';
import { peopleLine } from './PeopleCard';

/** Cada foto fica 9 s; a troca (dissolve) leva 1,8 s */
const PHOTO_MS = 9_000;
const FADE_MS = 1_800;
/** Continua de onde parou na próxima vez que o descanso abrir */
let turn = 0;

/** O descanso de tela do tema Sereno é de fotos em tela cheia (quando há fotos e elas estão escolhidas). */
export function photoAmbientActive() {
  const s = useSettings.getState();
  return isSereno(s.theme) && s.ambientSlides.includes('photos') && !!usePhotos.getState().ids?.length;
}

/** Carrega a foto antes de mostrar (a troca nunca passa por tela vazia). Desiste após 6 s. */
function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    const done = () => resolve();
    img.onload = () => (img.decode ? img.decode().then(done, done) : done());
    img.onerror = done;
    setTimeout(done, 6000);
    img.src = src;
  });
}

/** Número que troca rolando para cima (cada dígito separado). */
function Roll({ text }: { text: string }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span key={i} className="sv-roll">
          <span key={ch} className="sv-roll-in">
            {ch}
          </span>
        </span>
      ))}
    </>
  );
}

/**
 * Tema Sereno: fotos da família em tela cheia, trocando com dissolve e um movimento lento de câmera,
 * com relógio grande e avisos discretos. Quando alguém chega perto, a foto escurece e a Luna cumprimenta.
 * Desempenho: só duas fotos ficam na tela por vez e tudo se mexe por transform/opacity (sem desfoque ao vivo).
 */
export function PhotoAmbient({ now, weather, onExit, hint, greet }: { now: Date; weather: WeatherDto | null; onExit: () => void; hint: string; greet?: string | null }) {
  const ids = usePhotos((s) => s.ids) ?? [];
  const [layers, setLayers] = useState<{ id: string; n: number }[]>(() => (ids.length ? [{ id: ids[turn % ids.length]!, n: turn }] : []));
  const idsRef = useRef(ids);
  idsRef.current = ids;
  // O álbum chegou depois de abrir: mostra a primeira foto
  useEffect(() => {
    if (!layers.length && ids.length) setLayers([{ id: ids[turn % ids.length]!, n: turn }]);
  }, [ids.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const next = async () => {
      const list = idsRef.current;
      if (list.length < 2) return;
      const n = ++turn;
      const id = list[n % list.length]!;
      await preload(`/api/photos/${id}`);
      if (!alive) return;
      setLayers((l) => [...l.slice(-1), { id, n }]);
      // A foto de baixo sai da tela depois do dissolve
      timer = window.setTimeout(() => alive && setLayers((l) => l.slice(-1)), FADE_MS + 200);
    };
    const t = setInterval(() => void next(), PHOTO_MS);
    return () => {
      alive = false;
      clearInterval(t);
      clearTimeout(timer);
      turn++;
    };
  }, []);

  const fresh = unseenRecados(useRecados((s) => s.list));
  const lightsOn = useDevices((s) => Object.values(s.devices).filter((d) => !d.hidden && d.controllable && d.isOn && d.category === 'lighting').length);
  const people = peopleLine(usePeople((s) => s.list));
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const [hh, mm] = time.split(':');
  const nextRain = weather?.hourly.slice(0, 12).find((h) => h.precipitationProbability >= 40);
  const current = layers[layers.length - 1];

  return createPortal(
    <div
      className={`sv-amb overlay-full z-[65] overflow-hidden ${greet ? 'greet' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onExit();
      }}
      role="button"
      aria-label="Sair do descanso de tela"
    >
      {layers.map((l) => (
        <div key={l.n} className={`sv-ph kb${l.n % 3}`}>
          <img src={`/api/photos/${l.id}`} alt="" decoding="async" />
        </div>
      ))}
      <div className="sv-shade" />
      <div className="sv-dim" />

      {ids.length > 1 && ids.length <= 12 && current && (
        <div className="sv-dots">
          {ids.map((id, i) => (
            <i key={id} className={i === current.n % ids.length ? 'on' : ''} />
          ))}
        </div>
      )}

      <div className="sv-info">
        <div className="min-w-0">
          <p className="sv-date first-letter:uppercase">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
          <p className="sv-clock m-num">
            <Roll text={hh ?? ''} />
            <span className="sv-colon">:</span>
            <Roll text={mm ?? ''} />
          </p>
          <p className="sv-row">
            {weather && (
              <>
                <CloudSun className="h-5 w-5" />
                <b className="m-num">{Math.round(weather.current.temperature)}°</b>
                <span>· {nextRain ? `chuva ${nextRain.precipitationProbability}% às ${Number(nextRain.time.slice(11, 13))}h` : weather.current.condition.toLowerCase()}</span>
              </>
            )}
            {people && (
              <>
                {weather && <span className="opacity-40">|</span>}
                <span className="truncate">{people}</span>
              </>
            )}
          </p>
        </div>
        <div className="sv-cards">
          {fresh.length > 0 && (
            <div className="sv-glass sv-rec">
              <p className="flex items-center gap-2 font-semibold text-amber-200">
                <Video className="h-4 w-4" />
                {fresh.length === 1 ? `Recado novo de ${fresh[0]!.fromName}` : `${fresh.length} recados novos`}
              </p>
              <p className="mt-0.5 text-[13px] text-white/70">Toque na tela para assistir</p>
            </div>
          )}
          {lightsOn > 0 && (
            <div className="sv-glass">
              <p className="flex items-center gap-2 text-[15px] font-semibold">
                <Lightbulb className="h-4 w-4 text-amber-300" />
                {lightsOn === 1 ? '1 luz acesa' : `${lightsOn} luzes acesas`}
              </p>
            </div>
          )}
        </div>
      </div>
      <p className="sv-hint">{hint}</p>

      <div className="sv-hello" aria-live="polite">
        <div className="sv-hello-orb sv-anim" />
        <h1>{greet}</h1>
        {fresh.length > 0 && <p>Tem {fresh.length === 1 ? `um recado novo de ${fresh[0]!.fromName}` : `${fresh.length} recados novos`}</p>}
      </div>
    </div>,
    document.body,
  );
}
