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
  'luna-nlu': 'Luna (local)',
  'openai-realtime': 'Voz em tempo real',
};

/** A fala é um chamado à Luna? Tolera erros comuns de transcrição ("Luana"). */
export const isWakeCall = (text: string) => /\b(luna|luana|lunah|lunna)\b/.test(normalize(text));

/** Sinal sonoro curto ao ouvir “Ei, Luna” (como o anel de uma assistente). */
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
