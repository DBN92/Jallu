/** Ponte com o app Android da DIA (tablet). Só existe quando a DIA está aberta dentro do app. */
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
  listen(): void;
  openBattery(): void;
  openOverlay(): void;
  openAppSettings(): void;
  changeServer(): void;
  update(): void;
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
