// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeWord } from './useWakeWord';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Handler = ((e: unknown) => void) | null;
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static failNextStart = 0;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  running = false;
  onresult: Handler = null;
  onerror: Handler = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    if (FakeRecognition.failNextStart > 0) {
      FakeRecognition.failNextStart--;
      throw new Error('InvalidStateError');
    }
    this.running = true;
    this.onstart?.();
  }
  stop() {
    this.end();
  }
  abort() {
    this.end();
  }
  end() {
    if (!this.running) return;
    this.running = false;
    setTimeout(() => this.onend?.(), 10);
  }
  say(text: string) {
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text } } } });
  }
}
const active = () => FakeRecognition.instances.filter((r) => r.running);

function Harness({ paused, onCmd }: { paused: boolean; onCmd: (t: string) => void }) {
  useWakeWord(true, paused, onCmd);
  return null;
}

describe('“Ei, Luna” contínuo', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.instances = [];
    FakeRecognition.failNextStart = 0;
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14) Chrome/140', configurable: true });
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  const render = (paused: boolean, onCmd: (t: string) => void) => act(() => root.render(createElement(Harness, { paused, onCmd })));
  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it('funciona várias vezes seguidas (pausa durante a resposta e volta)', () => {
    const cmds: string[] = [];
    const onCmd = (t: string) => cmds.push(t);
    render(false, onCmd);
    advance(300);
    for (let i = 1; i <= 3; i++) {
      expect(active()).toHaveLength(1);
      act(() => active()[0]!.say(`ei luna pedido ${i}`));
      expect(cmds).toHaveLength(i);
      expect(active()).toHaveLength(0); // microfone liberado para a resposta
      render(true, onCmd); // Luna processando/falando
      advance(2000);
      expect(active()).toHaveLength(0);
      render(false, onCmd); // voltou a ficar disponível
      advance(400);
    }
    expect(cmds).toEqual(['pedido 1', 'pedido 2', 'pedido 3']);
  });

  it('volta a escutar sozinho mesmo se o pedido não ocupar a Luna', () => {
    const cmds: string[] = [];
    render(false, (t) => cmds.push(t));
    advance(300);
    act(() => active()[0]!.say('ei luna'));
    advance(7000);
    expect(active()).toHaveLength(1);
    act(() => active()[0]!.say('luna de novo'));
    expect(cmds).toEqual(['', 'de novo']);
  });

  it('reinicia quando o Chrome encerra a sessão e quando start() falha', () => {
    render(false, () => undefined);
    advance(300);
    act(() => active()[0]!.end()); // Chrome encerrou após silêncio
    FakeRecognition.failNextStart = 2;
    advance(6000);
    expect(active()).toHaveLength(1);
  });

  it('nunca abre dois reconhecedores ao mesmo tempo', () => {
    render(false, () => undefined);
    advance(300);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(30_000);
    expect(active().length).toBeLessThanOrEqual(1);
  });
});
