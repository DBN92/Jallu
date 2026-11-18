import { useEffect } from 'react';
import { nextFocus, tvKey } from '../lib/tv';

const FOCUSABLE = 'input:not([disabled]):not([type="hidden"]), button:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/**
 * Controle remoto (Fire TV / Android TV) nas telas fora do modo TV — login e “sem conexão”. O navegador
 * da TV não anda sozinho entre os campos: as setas levam ao campo/botão mais próximo naquela direção
 * (com destaque visível), e o OK abre o teclado no campo ou aperta o botão.
 */
export function useDpadNav(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add('dpad');
    const items = () => [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
    // começa no primeiro campo
    const t = setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body || !(document.activeElement as HTMLElement).matches?.('input, textarea')) {
        const list = items();
        (list.find((el) => el.tagName === 'INPUT') ?? list[0])?.focus();
      }
    }, 300);
    const onKey = (e: KeyboardEvent) => {
      const k = tvKey(e);
      if (!k || k === 'back') return;
      const list = items();
      if (!list.length) return;
      const cur = document.activeElement as HTMLElement | null;
      const inField = !!cur && (cur.tagName === 'INPUT' || cur.tagName === 'TEXTAREA');
      if (k === 'ok') {
        if (inField) {
          // reabre o teclado da TV no campo (só o foco não abre)
          cur!.blur();
          cur!.focus();
          cur!.click();
          return;
        }
        return; // botão/link: o OK já aperta
      }
      // no campo, esquerda/direita andam no texto se houver texto; senão mudam de item
      if (inField && (k === 'left' || k === 'right') && (cur as HTMLInputElement).value) return;
      if (k !== 'up' && k !== 'down' && k !== 'left' && k !== 'right') return;
      e.preventDefault();
      if (!cur || !list.includes(cur)) return list[0]!.focus();
      const boxes = list.map((el) => el.getBoundingClientRect());
      const i = nextFocus(cur.getBoundingClientRect(), boxes, k);
      if (i >= 0) {
        list[i]!.focus();
        list[i]!.scrollIntoView?.({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('dpad');
    };
  }, [enabled]);
}
