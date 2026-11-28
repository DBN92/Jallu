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

// ---------------------------------------------------------------------------------------------
// Perguntas sobre a própria vida (“quantos gatos eu tenho?”, “onde eu trabalho?”, “qual meu time?”):
// se alguma memória fala do assunto, responde com ela na hora — sem esperar a IA (que no servidor
// antigo demora, e a da nuvem não recebe as memórias).

/** Palavras que não identificam o assunto da pergunta */
const GENERIC = new Set(
  'eu meu minha meus minhas me mim tenho tem temos qual quais quanto quanta quantos quantas quem onde quando como que o a os as um uma de da do das dos e é sao sou esta estao voce luna sabe lembra lembrar nome nomes chama chamam se ja agora hoje sobre pra para por favor oi ola isso aquilo ai la aqui mesmo'.split(' '),
);
const stem = (w: string) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
const words = (t: string) => normalize(t).split(/\s+/).filter(Boolean).map(stem);

/** É pergunta sobre um fato da própria pessoa? (não pedido de opinião/sugestão) */
export function isSelfFactQuestion(text: string): boolean {
  const t = normalize(text);
  if (!/^(qual|quais|quantos|quantas|quanto|quem|onde|quando|como|o que|que|eu tenho|tenho|eu moro|eu trabalho|voce sabe|sabe)\b/.test(t)) return false;
  if (!/\b(meu|minha|meus|minhas|eu tenho|tenho|eu moro|moro|eu trabalho|trabalho|eu nasci|nasci|eu sou|eu gosto|gosto)\b/.test(t)) return false;
  return !/\b(para eu|pra eu|devo|posso|recomend\w*|suger\w*|melhor|deveria|acha|ideia|dica)\b/.test(t);
}

/** Memórias que falam do assunto da pergunta (as mais parecidas primeiro) */
export function matchMemories(question: string, memories: { content: string }[]): { content: string }[] {
  const keys = [...new Set(words(question).filter((w) => w.length >= 3 && !GENERIC.has(w)))];
  if (!keys.length) return [];
  const scored = memories
    .map((m) => {
      const mw = new Set(words(m.content));
      return { m, score: keys.filter((k) => mw.has(k)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  return scored.filter((x) => x.score === scored[0]!.score).slice(0, 2).map((x) => x.m);
}

export function quoteMemories(hits: { content: string }[]): string {
  return `Pelo que você me contou: ${hits.map((h) => `“${h.content.replace(/[.!]+$/, '')}”`).join(' e ')}.`;
}
