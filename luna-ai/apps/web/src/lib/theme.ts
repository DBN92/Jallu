/** Temas visuais da DIA. “hud” é o visual original; os outros são os modernos (cantos arredondados). */
export type ThemeId = 'hud' | 'aurora' | 'neon' | 'grafite';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  desc: string;
  fonts: string;
  /** Cores para a miniatura em Ajustes: fundo, cartão, destaque 1, destaque 2 */
  swatch: [string, string, string, string];
  /** Cor da barra do navegador/PWA */
  meta: string;
}

export const THEMES: ThemeInfo[] = [
  { id: 'aurora', name: 'Aurora', desc: 'Vidro escuro com brilhos ciano e violeta', fonts: 'Unbounded + Sora', swatch: ['#06070d', '#1a1d2b', '#22d3ee', '#8b5cf6'], meta: '#06070d' },
  { id: 'neon', name: 'Neon', desc: 'Preto profundo com ciano e verde-lima', fonts: 'Michroma + Space Grotesk', swatch: ['#05060a', '#0c0f16', '#00f0ff', '#b6ff3b'], meta: '#05060a' },
  { id: 'grafite', name: 'Grafite', desc: 'Cinza aconchegante com verde-água e âmbar', fonts: 'Exo 2 + Sora', swatch: ['#0d1016', '#1a1f28', '#2dd4bf', '#f59e0b'], meta: '#0d1016' },
  { id: 'hud', name: 'HUD clássico', desc: 'O visual original: painéis holográficos em 3D', fonts: 'Orbitron + Rajdhani', swatch: ['#02060b', '#08202f', '#00e5ff', '#3aa8ff'], meta: '#07080c' },
];

export const DEFAULT_THEME: ThemeId = 'aurora';
export const isModern = (t: ThemeId) => t !== 'hud';
export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

/** Aplica o tema no documento inteiro (CSS por data-theme) e avisa quem desenha em canvas. */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = id;
  const info = THEMES.find((t) => t.id === id)!;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', info.meta);
  window.dispatchEvent(new CustomEvent('luna-theme', { detail: id }));
}

/** Cores da onda do tema atual (lidas das variáveis CSS). */
export function waveColors(): { a: [number, number, number]; b: [number, number, number]; modern: boolean } {
  const css = getComputedStyle(document.documentElement);
  const parse = (v: string, fb: [number, number, number]): [number, number, number] => {
    const m = v.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return fb;
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  return {
    a: parse(css.getPropertyValue('--accent-1'), [0, 229, 255]),
    b: parse(css.getPropertyValue('--accent-2'), [0, 229, 255]),
    modern: (document.documentElement.dataset.theme ?? 'hud') !== 'hud',
  };
}
