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
  | { type: 'watch_status'; query: string }
  | { type: 'vacuum'; command: VacuumIntentCommand; target: string }
  | { type: 'litter'; command: 'clean' | 'auto_on' | 'auto_off' | 'status' }
  | { type: 'washer'; command: 'status' | 'start' | 'pause' | 'on' | 'off' }
  | { type: 'thanks' }
  | { type: 'recado'; command: 'record' | 'play' }
  | { type: 'lists'; command: 'buy' | 'bought' | 'list_buy' | 'has' | 'note' | 'list_notes'; text: string };

/** Fala sobre a caixa de areia dos gatos? */
const LITTER_CONTEXT = /\b(caixa|caixinha)\s+(de\s+)?areia\b|\b(caixa|caixinha|banheiro|areia)\s+dos\s+gatos\b/;

/** “limpa a caixa de areia”, “liga a limpeza automática da caixa”, “quantas vezes os gatos usaram a caixa hoje?” */
function parseLitter(text: string): Intent | null {
  if (!LITTER_CONTEXT.test(text) || DEFERRED.test(text)) return null;
  if (/\blimpeza automatica\b/.test(text)) {
    if (/\b(deslig\w*|desativ\w*|para|pare|tira)\b/.test(text)) return { type: 'litter', command: 'auto_off' };
    if (/\b(lig\w*|ativ\w*|coloca|bota)\b/.test(text)) return { type: 'litter', command: 'auto_on' };
    return { type: 'litter', command: 'status' };
  }
  if (/\b(limp(a|e|ar)|faz a limpeza|gira)\b/.test(text) && !/\b(quando|quantas|limpou|esta limpa)\b/.test(text)) return { type: 'litter', command: 'clean' };
  return { type: 'litter', command: 'status' };
}

/** Só agradecimento/despedida (com outro pedido junto não conta). Recebe o texto já normalizado. */
export function isThanks(t: string): boolean {
  if (!/\b(obrigad[oa]s?|brigad[oa]|valeu|agradec\w*|tchau|falou|era so isso|e so isso|so isso|pode encerrar|encerra\w*|ate mais|ate logo)\b/.test(t)) return false;
  return !t
    .replace(/\b(oi|ola|ok|ta|ta bom|beleza|luna|muito|muitissimo|mesmo|viu|por tudo|pela ajuda|obrigad[oa]s?|brigad[oa]|valeu|agradec\w*|tchau|falou|era so isso|e so isso|so isso|pode encerrar|encerra\w*|ate mais|ate logo|de verdade|entao|bom|boa noite|bom dia|boa tarde|e|a|o|pra|por|voce|te)\b/g, ' ')
    .trim();
}

/**
 * Lista da casa e notas: “põe leite e pão na lista”, “acabou o café”, “comprei o leite”,
 * “o que falta comprar?”, “tem arroz em casa?”, “cria uma nota: …”, “lê minhas notas”.
 * Usa o texto original (com acentos) para guardar os nomes dos itens.
 */
function parseLists(raw: string): Intent | null {
  const r = raw.trim().replace(/[.!]+$/, '');
  const t = normalize(r);
  const tail = (re: RegExp) => r.match(re)?.[1]?.trim() ?? null;
  // anotações
  const note = tail(/^(?:por favor,?\s*)?(?:cri[ae]|criar|fa[çz]a|faz|adicion[ae]|escrev[ae])\s+(?:uma\s+)?(?:nova\s+)?nota\s*(?:dizendo|que diz|com|:)?\s*(?:que\s+)?(.{2,})$/i) ?? tail(/^nota\s*:\s*(.{2,})$/i);
  if (note) return { type: 'lists', command: 'note', text: note };
  if (/\bnotas\b/.test(t) && /\b(le|ler|leia|quais|mostr\w*|minhas|tem|tenho|ha)\b/.test(t)) return { type: 'lists', command: 'list_notes', text: '' };
  // pôr na lista de compras
  const add = tail(/^(?:por favor,?\s*)?(?:adicion[ae]r?|coloc[ae]r?|p[õo]e|p[ôo]r|bot[ae]r?|inclu[aií]r?|anot[ae])\s+(.+?)\s+(?:na|[àa])\s+lista(?:\s+de\s+compras?|\s+do mercado)?$/i);
  if (add) return { type: 'lists', command: 'buy', text: add };
  const need = tail(/^(?:a gente\s+|n[óo]s\s+)?(?:precis[ao]\w*|tem(?:os)? que|temos de)\s+comprar\s+(.+)$/i);
  if (need) return { type: 'lists', command: 'buy', text: need };
  const out = tail(/^(?:j[áa]\s+)?(?:acab(?:ou|aram)|termin(?:ou|aram))\s+(?:o|a|os|as)\s+(.+)$/i) ?? tail(/^(?:est[áa]\s+)?falt(?:a|ando|am)\s+(.+?)(?:\s+em casa)?$/i);
  if (out && !/\b(luz|energia|internet|bateria|limpeza|ciclo|lavagem|quanto|quantos|tempo|minutos?|horas?|pouco|roupa|maquina)\b/.test(normalize(out))) return { type: 'lists', command: 'buy', text: out };
  const bought = tail(/^(?:eu\s+|j[áa]\s+)?comprei\s+(.+)$/i);
  if (bought) return { type: 'lists', command: 'bought', text: bought };
  if (/\b(o que|que|oque)\s+(?:falta|precis\w+|tem que|temos que)\s+comprar\b/.test(t) || (/\blista de compras?\b/.test(t) && !/\b(adicion|coloc|poe|por|bot|inclu|anot)/.test(t))) return { type: 'lists', command: 'list_buy', text: '' };
  const has = tail(/^(?:a gente\s+|n[óo]s\s+)?(?:ainda\s+)?tem\s+(.+?)\s+(?:em casa|na despensa|na geladeira|no armario|no armário)\??$/i);
  if (has && !/\b(luz|luzes|lampada|ligad\w*|aces\w*|alguem|gente|pessoa)\b/.test(normalize(has))) return { type: 'lists', command: 'has', text: has };
  return null;
}

/** Fala sobre a lava e seca? (“quanto falta para a máquina?”, “a roupa está pronta?”) */
const WASHER_CONTEXT = /\b(lava e seca|lava-e-seca|lavadora|lava roupas?|maquina de (lavar|roupa)|lavagem)\b|\broupas?\b.*\b(pronta|lavando|secando|maquina)\b|\b(a|na|da) maquina\b(?!\s+de\s+(cafe|gelo|pao|costura))/;

function parseWasher(text: string): Intent | null {
  if (!WASHER_CONTEXT.test(text)) return null;
  let command: 'status' | 'start' | 'pause' | 'on' | 'off' = 'status';
  if (/\b(quanto|quando|falta|terminou|termina|acabou|acaba|pronta|como esta|esta (lavando|secando|ligada))\b/.test(text)) command = 'status';
  else if (/\bpaus\w*\b/.test(text)) command = 'pause';
  else if (/\b(continu\w*|retom\w*|comec\w*|inici\w*|bota pra lavar|manda lavar)\b/.test(text)) command = 'start';
  else if (/\bdeslig\w*\b/.test(text)) command = 'off';
  else if (/\b(liga|ligar|ligue)\b/.test(text)) command = 'on';
  // “quando terminar, desliga a máquina” é automação, não comando agora
  if (command !== 'status' && DEFERRED.test(text)) return null;
  return { type: 'washer', command };
}

export type VacuumIntentCommand = 'start' | 'pause' | 'stop' | 'return_to_base' | 'locate' | 'status';

/** Fala sobre o aspirador robô? (substantivo ou verbo de limpeza) */
const VACUUM_CONTEXT = /\b(aspirador(es)?|robo(s|zinhos?)?|aspir\w*|limpeza)\b|\blimp(a|e|ar)\s+(a\s+)?casa\b|\bmand\w*\b.*\blimp(ar|e)\b/;

/** “aspira a casa”, “manda o robô pra base”, “pausa o aspirador”, “onde está o robô?”, “bateria do aspirador” */
function parseVacuum(text: string, raw: string): Intent | null {
  if (!VACUUM_CONTEXT.test(text) || DEFERRED.test(text)) return null;
  let command: VacuumIntentCommand;
  if (/\b(onde|cade|encontr\w*|localiz\w*|apit\w*|ache|acha)\b/.test(text)) command = 'locate';
  else if (/\b(status|bateria|situacao|terminou|acabou)\b/.test(text) || /\b(como)\s+(esta|ta|estao)\b/.test(text) || /\b(esta|ta|estao)\s+(ligad|deslig|limpando|aspirando|carregando|na base|funcionando|parad)/.test(text) || (/\?\s*$/.test(raw) && !/\b(pode|poderia|consegue)\b/.test(text))) command = 'status';
  else if (/\b(volt\w*|retorn\w*|recolh\w*|base|carregar|desliga|desligue|desligar)\b/.test(text)) command = 'return_to_base';
  else if (/\bpaus\w*\b/.test(text)) command = 'pause';
  else if (/\b(pare|parar|interromp\w*|cancel\w*)\b|^para\b|\bpara (de|o|a|os)\b/.test(text) && !/\bpara (a )?base\b/.test(text)) command = 'stop';
  else if (/\b(lig\w*|ativ\w*|inici\w*|comec\w*|aspir\w*|limp\w*|mand\w*|pode|bota|coloca)\b/.test(text)) command = 'start';
  else return null;
  const target = cleanTarget(
    text
      .replace(/\b(aspirador(es)?|robo(s|zinhos?)?|aspir\w*|limp\w*|limpeza|casa|toda|inteira|onde|cade|encontr\w*|localiz\w*|apit\w*|ache|acha|status|bateria|situacao|terminou|acabou|como|esta|ta|estao|ligad\w*|deslig\w*|carregando|funcionando|parad\w*|volt\w*|retorn\w*|recolh\w*|base|carregar|paus\w*|pare|parar|para|interromp\w*|cancel\w*|lig\w*|ativ\w*|inici\w*|comec\w*|mand\w*|pode|bota|coloca|faz|faca|de|do|da|o|a|os|as|pra|pro|na|no|ele|e|que|um|uma|sua|seu|qual|quais|com|meu|minha|nivel|vai|ir|agora|tudo)\b/g, ' '),
  );
  return { type: 'vacuum', command, target };
}

const ON = 'acenda|acende|acender|ligue|liga|ligar|ative|ativa|ativar';
const OFF = 'apague|apaga|apagar|desligue|desliga|desligar|desative|desativa|desativar';
/** Pedidos agendados/condicionais NÃO são comandos imediatos (vão para o LLM / automações). */
const DEFERRED = /\b(automac\w*|rotina|cena|quando|sempre que|todo dia|todos os dias|toda noite|ao anoitecer|ao amanhecer|por do sol|nascer do sol|agende|agendar|programe|programar|crie|criar|daqui a|depois de|as \d{1,2}(h|:\d{2}| horas)|se eu|caso)\b/;

const FILLER = /\b(por favor|agora|pra mim|para mim|ai|rapidinho|obrigad[oa])\b/g;

/** Remove o chamado “Oi, Luna” (com ou sem saudação antes) e cortesias do início. */
export function stripWake(text: string): string {
  return text
    // “Oi, Luna, …”, “Luna …”, “oi Luna …” — o nome é o chamado; não é palavra comum de comando
    .replace(/^\s*(?:(?:ei|oi|olá|ola|hey|e ai)\s*,?\s*)?luna\b\s*[,!.:?]?\s*/i, '')
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
  // “Obrigado”, “valeu, era só isso”, “tchau”: resposta curta e a conversa termina
  if (isThanks(text)) return { type: 'thanks' };

  const remember = raw.match(/^(?:por favor,?\s*)?(?:lembre(?:-se)?|lembra|memorize|guarde|anote)\s+(?:que\s+|de que\s+|isso:?\s*)?(.{3,})$/i);
  if (remember && !/\b(de|para)\s+(ligar|desligar|acender|apagar)\b/i.test(remember[1]!)) {
    return { type: 'remember', content: remember[1]!.trim().replace(/[.!]+$/, '') };
  }
  const forget = raw.match(/^(?:por favor,?\s*)?(?:esque[çc]a|esquece|apague da mem[óo]ria|remova da mem[óo]ria)\s+(?:que\s+|de que\s+|sobre\s+|o que eu disse sobre\s+)?(.{2,})$/i);
  if (forget) return { type: 'forget', content: forget[1]!.trim().replace(/[.!?]+$/, '') };

  // Recados em vídeo: “deixa um recado”, “quero gravar um recado”, “tem recado?”, “mostra os recados”
  if (/\brecados?\b/.test(text) && !DEFERRED.test(text)) {
    if (/\b(grav\w*|deix\w*|mand\w*|cri\w*|faz\w*|fazer|novo)\b/.test(text) && !/\b(tem|ha|algum|deixaram|deixou|mostr\w*|ver|veja|abr\w*)\b/.test(text)) return { type: 'recado', command: 'record' };
    return { type: 'recado', command: 'play' };
  }

  const litter = parseLitter(text);
  if (litter) return litter;

  const washer = parseWasher(text);
  if (washer) return washer;

  const vacuum = parseVacuum(text, raw);
  if (vacuum) return vacuum;

  const lists = parseLists(raw);
  if (lists) return lists;

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
  if (/\b(todas?|todos?|ambas?|ambos|os dois|as duas)\b/.test(text)) return options.map((_, i) => i);
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
