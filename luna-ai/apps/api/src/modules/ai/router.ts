import type { AiMode } from '@luna/shared';
import { normalize } from '../../lib/text';
import type { AIProvider } from './types';

export type Complexity = 'home' | 'simple' | 'complex';

const COMPLEX = /\b(organiz\w*|planej\w*|plano|roteiro|escrev\w*|redija|redigir|explique|explica|resum\w*|ideias?|sugest\w*|estrateg\w*|compar\w*|analis\w*|crie uma automacao|criar uma automacao|traduz\w*|receita|email|e-mail|texto|lista de|agenda|semana|codigo|programa\w*|por que|porque)\b/;
const HOME = /\b(luz|luzes|lampada|tomada|interruptor|sensor|ventilador|ar condicionado|dispositivo|ligad|desligad|acesa|apagad|casa)\b/;

export function classify(message: string): Complexity {
  const t = normalize(message);
  if (COMPLEX.test(t) || t.length > 160) return 'complex';
  if (HOME.test(t)) return 'home';
  return 'simple';
}

/**
 * Decide a ordem de provedores a tentar.
 * - local: somente Ollama (nunca envia dados para a nuvem)
 * - cloud: OpenAI, com Ollama como contingência
 * - hybrid: tarefas complexas na OpenAI; casa/conversa simples no Ollama
 */
export function routeProviders(message: string, mode: AiMode, providers: { ollama: AIProvider; openai: AIProvider }): AIProvider[] {
  const { ollama, openai } = providers;
  if (mode === 'local') return [ollama];
  if (mode === 'cloud') return [openai, ollama];
  return classify(message) === 'complex' ? [openai, ollama] : [ollama, openai];
}
