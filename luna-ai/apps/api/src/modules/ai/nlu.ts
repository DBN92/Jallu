import { normalize } from '../../lib/text';

/**
 * NLU local e determinística para comandos frequentes em português.
 * Executa rápido, sem LLM, e só produz intenções que o backend valida antes de agir.
 */
export type Intent =
  | { type: 'device_power'; action: 'turn_on' | 'turn_off'; target: string; all: boolean; lightHint: boolean }
  | { type: 'brightness'; target: string; value: number }
  | { type: 'device_query'; target: string }
  | { type: 'list_on'; category: 'lighting' | null }
  | { type: 'datetime'; what: 'time' | 'date' }
  | { type: 'weather'; period: 'now' | 'today' | 'tomorrow' | 'week'; umbrella: boolean }
  | { type: 'remember'; content: string }
  | { type: 'forget'; content: string }
  | { type: 'show_camera'; target: string }
  | { type: 'watch_status'; query: string };

const ON = 'acenda|acende|acender|ligue|liga|ligar|ative|ativa|ativar';
const OFF = 'apague|apaga|apagar|desligue|desliga|desligar|desative|desativa|desativar';
/** Pedidos agendados/condicionais NÃO são comandos imediatos (vão para o LLM / automações). */
const DEFERRED = /\b(automac\w*|rotina|cena|quando|sempre que|todo dia|todos os dias|toda noite|ao anoitecer|ao amanhecer|por do sol|nascer do sol|agende|agendar|programe|programar|crie|criar|daqui a|depois de|as \d{1,2}(h|:\d{2}| horas)|se eu|caso)\b/;

const FILLER = /\b(por favor|agora|pra mim|para mim|ai|rapidinho|obrigad[oa])\b/g;

/** Remove “oi, Dia”, “Dia,” e cortesias do início. */
export function stripWake(text: string): string {
  return text
    // “Oi, Dia, …” / “Dia, …” (e o nome antigo “Luna”); “dia” sem saudação nem vírgula fica (ex.: “dia 15…”)
    .replace(/^\s*(ei|oi|olá|ola|hey|e ai)\s*,?\s*(dia|luna)\b\s*[,!.:]?\s*/i, '')
    .replace(/^\s*(dia|luna)\s*[,!:]\s*/i, '')
    .trim();
}

const cleanTarget = (t: string) =>
  t
    .replace(FILLER, ' ')
    .replace(/\b(voce pode|pode|poderia|consegue)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function parseIntent(original: string): Intent | null {
  const raw = stripWake(original);
  const text = normalize(raw);
  if (!text) return null;

  // Memória explícita
  const remember = raw.match(/^(?:por favor,?\s*)?(?:lembre(?:-se)?|lembra|memorize|guarde|anote)\s+(?:que\s+|de que\s+|isso:?\s*)?(.{3,})$/i);
  if (remember && !/\b(de|para)\s+(ligar|desligar|acender|apagar)\b/i.test(remember[1]!)) {
    return { type: 'remember', content: remember[1]!.trim().replace(/[.!]+$/, '') };
  }
  const forget = raw.match(/^(?:por favor,?\s*)?(?:esque[çc]a|esquece|apague da mem[óo]ria|remova da mem[óo]ria)\s+(?:que\s+|de que\s+|sobre\s+|o que eu disse sobre\s+)?(.{2,})$/i);
  if (forget) return { type: 'forget', content: forget[1]!.trim().replace(/[.!?]+$/, '') };

  // Câmeras: “mostre a câmera da garagem”, “abrir câmera”, “ver as câmeras”
  const cam = text.match(/\b(?:mostr\w*|abr\w*|ver|veja|exib\w*|quero ver|me mostra)\b.*?\bcameras?\b\s*(.*)$/);
  if (cam) return { type: 'show_camera', target: cleanTarget(cam[1] ?? '') };

  // Garagem: “o carro está na garagem?”, “o portão está aberto?”, “como está a garagem?”
  if (/\b(carro|portao|garagem)\b/.test(text) && /\b(esta|ta|estao|tem|como|aberto|fechado|dentro|fora|saiu|chegou)\b/.test(text) && !/\b(acend|apag|lig|deslig|abr[ae]|fech[ae])\w*\b.*\b(luz|lampada|portao)\b/.test(text) && !/^(acend|apag|lig|deslig)/.test(text)) {
    return { type: 'watch_status', query: text };
  }

  // Data e hora
  if (/\b(que horas sao|que hora e|que horas e|me diga as horas|horario agora)\b/.test(text)) return { type: 'datetime', what: 'time' };
  if (/\b(que dia e hoje|qual (e )?a data|que data e hoje|qual o dia de hoje|dia da semana)\b/.test(text)) return { type: 'datetime', what: 'date' };

  const deferred = DEFERRED.test(text);

  // Brilho
  const pct = text.match(/\b(\d{1,3})\s*(?:%|por cento|porcento)/) ?? raw.match(/(\d{1,3})\s*%/);
  if (!deferred && pct && /\b(brilho|luz|luzes|lampada|abajur|luminaria|coloque|coloca|deixe|deixa|ajuste|ajusta|mude|muda|diminua|aumente|bota)\b/.test(text)) {
    const value = Math.min(100, Number(pct[1]));
    const target = cleanTarget(
      text
        .replace(/\b\d{1,3}\s*(%|por cento|porcento)?/g, ' ')
        .replace(/\b(coloque|coloca|deixe|deixa|ajuste|ajusta|mude|muda|defina|define|bota|diminua|aumente|o brilho|brilho|em|para|pra|no|na|com)\b/g, ' '),
    );
    return { type: 'brightness', target, value };
  }

  // Ligar / desligar
  const off = deferred ? null : text.match(new RegExp(`\\b(${OFF})\\b\\s*(.*)$`));
  const on = off || deferred ? null : text.match(new RegExp(`\\b(${ON})\\b\\s*(.*)$`));
  const m = off ?? on;
  if (m) {
    const rest = cleanTarget(m[2] ?? '');
    const lightHint = /\b(acend|apag)/.test(m[1]!) || /\b(luz|luzes|lampadas?|abajur|luminaria)\b/.test(rest);
    const all = /\b(todas?|todos?|tudo)\b/.test(rest) && (lightHint || /\b(luz|luzes|lampadas)\b/.test(rest));
    return { type: 'device_power', action: off ? 'turn_off' : 'turn_on', target: rest, all, lightHint };
  }

  // Consultas de estado
  if (/\b(quais|que)\b.*\b(luzes|lampadas)\b.*\b(acesas|ligadas)\b/.test(text) || /\b(tem|ha)\s+(alguma\s+)?luz\s+(acesa|ligada)\b/.test(text)) {
    return { type: 'list_on', category: 'lighting' };
  }
  if (/\b(o que|oque)\s+(esta|ta)\s+ligad[oa]\b/.test(text)) return { type: 'list_on', category: null };
  const q = text.match(/^(?:a |o |as |os )?(.+?)\s+(?:esta|ta|estao|tao)\s+(?:ligad[ao]s?|acesas?|acesos?|apagad[ao]s?|desligad[ao]s?)\b/);
  if (q) return { type: 'device_query', target: cleanTarget(q[1]!) };

  // Clima
  const umbrella = /\bguarda\s?chuva\b/.test(text);
  if (umbrella || /\b(chov\w*|chuva|previsao|clima|como (esta|ta|vai estar|vai ficar) o tempo|tempo (hoje|amanha|agora)|temperatura (hoje|agora|la fora|amanha|de hoje|lá fora)|vai fazer (frio|calor|sol)|(esta|ta) (frio|calor) la fora)\b/.test(text)) {
    const period = /\bamanha\b/.test(text) ? 'tomorrow' : /\b(semana|proximos dias)\b/.test(text) ? 'week' : /\b(agora|neste momento|la fora)\b/.test(text) ? 'now' : 'today';
    return { type: 'weather', period, umbrella };
  }
  return null;
}

/** Tenta interpretar a resposta do usuário a uma pergunta de desambiguação. */
export function pickOption(answer: string, options: { name: string }[]): number[] | null {
  const text = normalize(stripWake(answer));
  if (/\b(todas?|todos?|ambas?|ambos)\b/.test(text)) return options.map((_, i) => i);
  const ordinals = ['primeir', 'segund', 'terceir', 'quart', 'quint'];
  for (let i = 0; i < Math.min(options.length, ordinals.length); i++) {
    if (new RegExp(`\\b${ordinals[i]}[oa]?\\b`).test(text) || text === String(i + 1)) return [i];
  }
  const scored = options
    .map((o, i) => {
      const words = normalize(o.name).split(' ').filter((w) => w.length > 2);
      return { i, hits: words.filter((w) => text.includes(w)).length, total: words.length };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return null;
  // Desempate: prefere a opção cujo nome contém palavras exclusivas citadas
  if (scored.length > 1 && scored[0]!.hits === scored[1]!.hits) return null;
  return [scored[0]!.i];
}
