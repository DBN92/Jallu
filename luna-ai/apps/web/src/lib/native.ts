/** Ponte com o app Android da Luna (tablet). Só existe quando a Luna está aberta dentro do app. */
export interface NativeStatus {
  version: string;
  versionCode: number;
  wake: boolean;
  token: boolean;
  /** parado | ouvindo | baixando 40% | ouvindo o pedido | pensando | falando | erro: … */
  listening: string;
  modelReady: boolean;
  mic: boolean;
  autostart: boolean;
  overlay: boolean;
  battery: boolean;
  keepOn: boolean;
  /** Tela cheia, sem as barras do Android (app 1.0.5 em diante) */
  fullscreen?: boolean;
  sensitivity: 'alta' | 'normal' | 'baixa';
}

interface Bridge {
  version(): string;
  versionCode(): number;
  status(): string;
  setToken(t: string): void;
  setWake(on: boolean): void;
  setSensitivity(s: string): void;
  setAutostart(on: boolean): void;
  setKeepOn(on: boolean): void;
  setFullscreen?(on: boolean): void;
  /** Baixa o brilho da tela ao mínimo (app 1.0.8 em diante) */
  setDim?(on: boolean): void;
  /** Apagar a tela de verdade e acender quando alguém chegar (app 1.0.13 em diante) */
  screenOffReady?(): boolean;
  enableScreenOff?(): void;
  sleepScreen?(): boolean;
  wakeScreen?(): void;
  /** A tela conduz a conversa com a voz em tempo real ao ouvir “Oi, Luna” (app 1.0.15 em diante) */
  setVoiceHandoff?(on: boolean): void;
  /** Pausa a escuta do “Oi, Luna” enquanto a tela usa o microfone (app 1.0.8 em diante) */
  pauseWake?(on: boolean): void;
  listen(): void;
  openBattery(): void;
  openOverlay(): void;
  openAppSettings(): void;
  changeServer(): void;
  update(): void;
  /** Fala um aviso pelo tablet (app 1.0.4 em diante) */
  speak?(text: string): void;
}

export const nativeApp = (): Bridge | null => ((window as unknown as { DiaAndroid?: Bridge }).DiaAndroid ?? null);

export function nativeStatus(): NativeStatus | null {
  const b = nativeApp();
  if (!b) return null;
  try {
    return JSON.parse(b.status()) as NativeStatus;
  } catch {
    return null;
  }
}

/** Evento enviado pelo app durante a conversa por voz (para mostrar a animação). */
export interface NativeVoiceEvent {
  state: 'listening' | 'processing' | 'speaking' | 'idle' | 'error';
  heard: string;
  reply: string;
}
