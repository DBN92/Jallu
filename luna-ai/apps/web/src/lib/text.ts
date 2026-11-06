export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export const STATE_LABEL: Record<string, string> = {
  idle: 'Disponível',
  listening: 'Ouvindo…',
  processing: 'Pensando…',
  acting: 'Executando ação…',
  speaking: 'Respondendo…',
  error: 'Erro de conexão',
};

export const PROVIDER_LABEL: Record<string, string> = {
  ollama: 'IA local',
  openai: 'OpenAI',
  'luna-nlu': 'DIA (local)',
  'openai-realtime': 'Voz em tempo real',
};

/**
 * “Oi, Dia” (também “Olá/Ei/Hey, Dia” e “oidia”, como alguns celulares transcrevem).
 * Exige a saudação antes do nome: “dia” sozinho é comum demais (“bom dia”, “que dia é hoje”).
 */
const WAKE_RE = /\b(?:oi|ola|ei|hey)\s+dia\b\s*(.*)$|\boidia\b\s*(.*)$/;
export const isWakeCall = (text: string) => WAKE_RE.test(normalize(text));
/** Se a fala chama a DIA, devolve o pedido que veio junto (pode ser vazio); senão, null. */
export function splitWake(text: string): string | null {
  const m = normalize(text).match(WAKE_RE);
  return m ? (m[1] ?? m[2] ?? '').trim() : null;
}

/** Sinal sonoro curto ao ouvir “Oi, Dia” (como o anel de uma assistente). */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [660, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* sem áudio */
  }
}
