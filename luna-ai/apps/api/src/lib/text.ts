/** Normaliza texto para comparação: minúsculas, sem acentos e pontuação. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'da', 'do', 'das', 'dos', 'de', 'na', 'no', 'nas', 'nos', 'em', 'e',
  'luz', 'luzes', 'lampada', 'lampadas', 'por', 'favor', 'pra', 'para', 'um', 'uma', 'meu', 'minha',
]);

export function significantTokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
