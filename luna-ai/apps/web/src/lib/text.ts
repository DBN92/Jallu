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

/**
 * Chamado direto: “Luna” no COMEÇO da frase — “Luna”, “Luna, acende a luz”.
 * Uma saudação antes (“oi Luna”) também vale, mas não é necessária. No meio da frase
 * (“pergunta pra Luna…”) não acorda.
 */
const WAKE_RE = /^\s*(?:(?:oi|ola|ei|hey|e ai)\s+)?luna\b\s*(.*)$/;
export const isWakeCall = (text: string) => WAKE_RE.test(normalize(text));
/** Se a fala chama a Luna, devolve o pedido que veio junto (pode ser vazio); senão, null. */
export function splitWake(text: string): string | null {
  const m = normalize(text).match(WAKE_RE);
  return m ? (m[1] ?? '').trim() : null;
}

/**
 * Como o reconhecimento costuma ouvir o chamado “Luna” quando a pessoa fala baixo ou de longe
 * (“lua”, “luma”, “lona”…). Só vale quando a frase é SÓ isso — curta e sozinha —, para não
 * acordar a Luna no meio de uma conversa (“a lua está linda”).
 */
const WAKE_LOOKALIKE = /^(?:(?:oi|ola|ei|hey|e ai)\s+)?(?:lua|luma|lona|lunna|luna+|nuna|luna a)$/;

/**
 * Procura o chamado “Luna” em todos os palpites do reconhecimento (o Android devolve vários).
 * Devolve o pedido que veio junto (pode ser vazio) ou null.
 */
export function matchWake(alternatives: string[]): string | null {
  for (const alt of alternatives) {
    const rest = splitWake(alt);
    if (rest !== null) return rest;
  }
  for (const alt of alternatives) {
    if (WAKE_LOOKALIKE.test(normalize(alt).replace(/[.,!?]/g, '').trim())) return '';
  }
  return null;
}

/** Sinal sonoro curto ao ouvir “Luna” (como o anel de uma assistente). */
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
