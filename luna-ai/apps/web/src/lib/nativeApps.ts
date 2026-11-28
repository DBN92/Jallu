/**
 * Atalhos de aplicativos no painel da TV (app Android da Luna na Fire TV): lista os apps instalados
 * e abre o escolhido. Quais aparecem fica salvo neste aparelho (cada TV tem os seus apps).
 */
export interface NativeApp {
  pkg: string;
  label: string;
  icon: string | null;
  /** Faixa 16:9 dos apps de TV (quando o app tem) */
  banner: string | null;
}

type Bridge = { listApps?: () => string; launchApp?: (pkg: string) => boolean };
const bridge = () => (window as unknown as { DiaAndroid?: Bridge }).DiaAndroid;

export const canLaunchApps = () => typeof bridge()?.listApps === 'function' && typeof bridge()?.launchApp === 'function';

let cache: NativeApp[] | null = null;
export function listApps(refresh = false): NativeApp[] {
  if (cache && !refresh) return cache;
  try {
    cache = JSON.parse(bridge()?.listApps?.() ?? '[]') as NativeApp[];
  } catch {
    cache = [];
  }
  return cache;
}

export const launchApp = (pkg: string) => !!bridge()?.launchApp?.(pkg);

const KEY = 'luna.tvApps';
/** Os de sempre, se estiverem instalados (pelo nome que aparece na TV) */
const DEFAULTS: RegExp[] = [/^youtube$|youtube(?!.*kids)/i, /prime\s*video/i, /netflix/i, /claro/i];

export function defaultApps(all: NativeApp[]): string[] {
  const out: string[] = [];
  for (const re of DEFAULTS) {
    const hit = all.find((a) => re.test(a.label) && !out.includes(a.pkg));
    if (hit) out.push(hit.pkg);
  }
  return out;
}

/** Escolhidos neste aparelho (null = ainda não escolheu: usa os padrões) */
export function savedApps(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}
export function saveApps(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sem armazenamento: vale só até fechar */
  }
}
