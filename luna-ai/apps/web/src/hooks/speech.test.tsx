// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeechSynthesis } from './speech';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class Utterance {
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  lang = '';
  rate = 1;
  voice: unknown = null;
  constructor(public text: string) {}
}

let mode: 'blocked' | 'ok' | 'silent' = 'ok';
const synth = {
  speaking: false,
  getVoices: () => [],
  cancel: vi.fn(),
  resume: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  speak: (u: Utterance) => {
    if (mode === 'blocked') setTimeout(() => u.onerror?.({ error: 'not-allowed' }), 5);
    if (mode === 'ok') {
      setTimeout(() => u.onstart?.(), 5);
      setTimeout(() => u.onend?.(), 500);
    }
    // silent: nunca dispara eventos (bug do Chrome)
  },
};

let api: ReturnType<typeof useSpeechSynthesis>;
function Harness() {
  api = useSpeechSynthesis();
  return null;
}

describe('fala da DIA', () => {
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(window, { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance });
    root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(Harness)));
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it.each([
    ['blocked', 'not-allowed'],
    ['silent', 'not-started'],
  ] as const)('modo %s: avisa o bloqueio e sempre termina (não trava em “falando”)', (m, code) => {
    mode = m;
    const onEnd = vi.fn();
    const onError = vi.fn();
    act(() => api.speak('Olá, eu sou a Dia.', { onEnd, onError }));
    act(() => void vi.advanceTimersByTime(4000));
    expect(onError).toHaveBeenCalledWith(code);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('modo normal: termina uma única vez', () => {
    mode = 'ok';
    const onEnd = vi.fn();
    const onError = vi.fn();
    act(() => api.speak('Pronto!', { onEnd, onError }));
    act(() => void vi.advanceTimersByTime(20_000));
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
