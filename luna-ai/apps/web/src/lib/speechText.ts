/**
 * Prepara texto para soar natural na voz do aparelho (pt-BR): troca símbolos e
 * abreviações pelo que se fala, remove markdown/emojis e evita leituras robóticas.
 */
export function toSpeech(text: string): string {
  let t = text;
  t = t.replace(/https?:\/\/\S+/g, ' ');
  // O nome “DIA” em maiúsculas seria soletrado pela voz; lê como “Dia”
  t = t.replace(/\bDIA\b/g, 'Dia');
  t = t.replace(/[*_#`>~|]/g, ' ').replace(/[✓✗•]/g, ' ');
  t = t.replace(/\p{Extended_Pictographic}/gu, ' ');
  // Horários 19:00 / 7:30 / 19h30
  t = t.replace(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/g, (_, h: string, m: string) => {
    const hh = Number(h);
    const hora = hh === 1 ? '1 hora' : `${hh} horas`;
    return m === '00' ? hora : `${hora} e ${Number(m)}`;
  });
  t = t.replace(/\b([01]?\d|2[0-3])h\b/g, (_, h: string) => (Number(h) === 1 ? '1 hora' : `${Number(h)} horas`));
  // Unidades e símbolos
  t = t.replace(/(\d)\s*°\s*C\b/g, '$1 graus');
  t = t.replace(/(\d)\s*°/g, '$1 graus');
  t = t.replace(/(\d)\s*%/g, '$1 por cento');
  t = t.replace(/(\d)\s*km\/h\b/gi, '$1 quilômetros por hora');
  t = t.replace(/(\d)\s*mm\b/g, '$1 milímetros');
  t = t.replace(/(\d)\s*kWh\b/g, '$1 quilowatts-hora');
  t = t.replace(/(\d)\s*W\b/g, '$1 watts');
  t = t.replace(/(\d),(\d)/g, '$1 vírgula $2');
  t = t.replace(/R\$\s*(\d+)/g, '$1 reais');
  t = t.replace(/\s*[—–]\s*/g, ', ');
  t = t.replace(/\s*\/\s*/g, ' de ');
  t = t.replace(/\s*\n+\s*/g, '. ');
  t = t.replace(/\.{2,}|…/g, '.');
  t = t.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ');
  return t.trim();
}

/**
 * Separa frases completas de um texto que ainda está chegando (streaming).
 * Retorna as frases prontas para falar e o resto ainda incompleto.
 */
export function takeSentences(buffer: string, minLength = 24): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let rest = buffer;
  const re = /[.!?]+["”')\]]?(\s+|$)|\n+/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer))) {
    const end = m.index + m[0].length;
    if (m[1] === '' && end === buffer.length && !/\n/.test(m[0])) break; // pontuação no fim: pode continuar (ex.: "3.5")
    const piece = buffer.slice(start, end).trim();
    // Junta frases muito curtas com a próxima para não soar picotado
    if (piece.length >= minLength || /\n/.test(m[0])) {
      ready.push(piece);
      start = end;
    }
  }
  rest = buffer.slice(start);
  return { ready: ready.filter(Boolean), rest };
}
