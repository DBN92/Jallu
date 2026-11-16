import { normalize } from '../../lib/text';

/**
 * Perguntas sobre a própria família/vida (“qual o nome da minha esposa?”, “quem é meu filho?”) são
 * respondidas direto das memórias, no servidor: na hora, com qualquer IA e sem mandar memórias para a
 * nuvem (pela voz a pergunta ia para a OpenAI, que — sem permissão de memória na nuvem — não sabia).
 */

/** Palavras que contam como a mesma relação nas memórias */
const SYNONYMS: Record<string, string[]> = {
  esposa: ['esposa', 'mulher', 'casado com', 'casei com'],
  mulher: ['esposa', 'mulher', 'casado com', 'casei com'],
  marido: ['marido', 'esposo', 'casada com', 'casei com'],
  esposo: ['marido', 'esposo', 'casada com', 'casei com'],
  mae: ['mae'],
  pai: ['pai'],
  namorada: ['namorada'],
  namorado: ['namorado'],
  filha: ['filha'],
  filho: ['filho'],
  filhos: ['filho', 'filha', 'filhos'],
  irma: ['irma'],
  irmao: ['irmao'],
  sogra: ['sogra'],
  sogro: ['sogro'],
  avo: ['avo'],
  cachorro: ['cachorro', 'cachorra', 'cao'],
  cachorra: ['cachorra', 'cachorro'],
  gato: ['gato', 'gata'],
  gata: ['gata', 'gato'],
  gatos: ['gato', 'gata', 'gatos'],
};
const FEMININE = new Set(['esposa', 'mulher', 'mae', 'namorada', 'filha', 'irma', 'sogra', 'cachorra', 'gata']);

export interface PersonalQuestion {
  relation: string;
  /** “minha”/“meu” como a pessoa falou (para responder “Sua esposa…”) */
  feminine: boolean;
  /** Quer o nome (“qual o nome”, “como se chama”, “quem é”) */
  name: boolean;
}

/** “qual o nome da minha esposa”, “como se chama meu filho”, “quem é minha mãe”, “o que você sabe da minha esposa” */
export function parsePersonal(text: string): PersonalQuestion | null {
  const t = normalize(text);
  const rel = Object.keys(SYNONYMS).join('|');
  const m =
    t.match(new RegExp(`\\b(?:qual|quais)\\s+(?:e\\s+)?(?:o\\s+|os\\s+)?nomes?\\s+(?:da|do|das|dos|de)\\s+(?:minha|meu|minhas|meus)\\s+(${rel})\\b`)) ??
    t.match(new RegExp(`\\bcomo\\s+(?:se\\s+)?chama(?:m)?\\s+(?:a\\s+|o\\s+|as\\s+|os\\s+)?(?:minha|meu|minhas|meus)\\s+(${rel})\\b`)) ??
    t.match(new RegExp(`\\bquem\\s+(?:e|sao)\\s+(?:a\\s+|o\\s+|as\\s+|os\\s+)?(?:minha|meu|minhas|meus)\\s+(${rel})\\b`)) ??
    t.match(new RegExp(`\\b(?:o\\s+)?que\\s+(?:voce\\s+)?sabe\\s+(?:sobre|da|do|de)\\s+(?:a\\s+|o\\s+)?(?:minha|meu)\\s+(${rel})\\b`));
  if (!m) return null;
  const relation = m[1]!;
  return { relation, feminine: FEMININE.has(relation), name: !/\bsabe\b/.test(t) };
}

/** Nome próprio logo depois de “se chama”, “chama-se”, “é a/o”, “nome dela/dele é” */
function extractName(memory: string): string | null {
  const m = memory.match(/(?:se chama|chama-se|chamad[ao]|nome (?:dela|dele|é)|é (?:a|o)|é)\s+([A-ZÀ-Ý][\p{L}'-]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][\p{L}'-]+)?)/u);
  if (m) return m[1]!;
  // “Natália é minha esposa”
  const before = memory.match(/^([A-ZÀ-Ý][\p{L}'-]+)\s+é\s+(?:a\s+|o\s+)?(?:minha|meu)\b/u);
  return before ? before[1]! : null;
}

/** Resposta pelas memórias (null = não sei; aí a Luna sugere como ensinar) */
export function answerPersonal(q: PersonalQuestion, memories: { content: string }[]): string {
  const words = SYNONYMS[q.relation] ?? [q.relation];
  const hits = memories.filter((m) => {
    const n = normalize(m.content);
    return words.some((w) => new RegExp(`\\b${w}\\b`).test(n));
  });
  const label = `${q.feminine ? 'Sua' : 'Seu'} ${q.relation === 'mae' ? 'mãe' : q.relation === 'irma' ? 'irmã' : q.relation === 'irmao' ? 'irmão' : q.relation === 'avo' ? 'avó' : q.relation}`;
  if (!hits.length) {
    const ex = q.relation === 'esposa' || q.relation === 'mulher' ? 'minha esposa se chama …' : `${q.feminine ? 'minha' : 'meu'} ${q.relation} se chama …`;
    return `Ainda não sei. Se quiser, me diga: “Luna, lembre que ${ex}”.`;
  }
  if (q.name) {
    for (const h of hits) {
      const name = extractName(h.content);
      if (name) return `${label} se chama ${name}.`;
    }
  }
  return `Pelo que você me contou: ${hits.slice(0, 2).map((h) => `“${h.content}”`).join(' e ')}.`;
}
