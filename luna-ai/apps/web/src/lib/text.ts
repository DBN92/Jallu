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
