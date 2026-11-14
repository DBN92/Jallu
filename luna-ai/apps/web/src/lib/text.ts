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
 * Chamado “Oi, Luna” (também “Olá/Ei/Hey, Luna” e “oiluna”, como alguns celulares transcrevem).
 * Exige a saudação antes do nome: assim “Luna” no meio de uma conversa não acorda a assistente,
 * e o reconhecimento acerta bem mais do que com uma palavra só.
 */
const WAKE_RE = /\b(?:oi|ola|ei|hey|e ai)\s+luna\b\s*(.*)$|\boiluna\b\s*(.*)$/;
export const isWakeCall = (text: string) => WAKE_RE.test(normalize(text));
/** Se a fala chama a Luna, devolve o pedido que veio junto (pode ser vazio); senão, null. */
export function splitWake(text: string): string | null {
  const m = normalize(text).match(WAKE_RE);
  return m ? (m[1] ?? m[2] ?? '').trim() : null;
}

/**
 * Como o reconhecimento costuma ouvir o “Oi, Luna” quando a pessoa fala baixo ou de longe
 * (“oi lua”, “boi luna”, “oi lona”…). Só vale quando a frase é SÓ isso — curta e sozinha —,
 * para não acordar a Luna no meio de uma conversa (“oi, a lua está linda”).
 */
const WAKE_LOOKALIKE = /^(?:oi+|hoi|boi|oie|ola|ei|hey|e ai)\s*(?:lua|luma|lona|una|nuna|lunna|luna+|lu na)$/;

/**
 * Procura o chamado “Oi, Luna” em todos os palpites do reconhecimento (o Android devolve vários).
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

/** Sinal sonoro curto ao ouvir “Oi, Luna” (como o anel de uma assistente). */
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

/**
 * “Obrigado”, “valeu, Luna”, “brigada, era só isso”, “tchau”: a pessoa encerrou a conversa.
 * Agradecimento junto com outro pedido (“obrigado, agora apaga a luz”) não encerra.
 */
export function isThanks(text: string): boolean {
  const t = normalize(text);
  if (!/\b(obrigad[oa]s?|brigad[oa]|valeu|agradec\w*|tchau|falou|era so isso|e so isso|so isso|pode encerrar|encerra\w*|ate mais|ate logo)\b/.test(t)) return false;
  const rest = t
    .replace(/\b(oi|ola|ok|ta|ta bom|beleza|luna|muito|muitissimo|mesmo|viu|por tudo|pela ajuda|obrigad[oa]s?|brigad[oa]|valeu|agradec\w*|tchau|falou|era so isso|e so isso|so isso|pode encerrar|encerra\w*|ate mais|ate logo|de verdade|entao|bom|boa noite|bom dia|boa tarde|e|a|o|pra|por|voce|te)\b/g, ' ')
    .trim();
  return rest.length === 0;
}
