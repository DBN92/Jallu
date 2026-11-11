#!/usr/bin/env bash
# Mostra, lado a lado, o que a caixa de areia mandou ao Home Assistant e as visitas que a Luna
# registrou — para conferir e acertar a contagem por gato. Somente leitura; não mostra o token.
# Uso: sudo bash scripts/historico-caixa.sh [horas]   (padrão: 48 horas)
set -euo pipefail
cd "$(dirname "$0")/.."
NODE=./runtime/node/bin/node
[ -x "$NODE" ] || NODE=node
[ -f .env ] || { echo "Arquivo .env não encontrado em $(pwd)"; exit 1; }
export HORAS="${1:-48}"

"$NODE" - <<'JS'
const fs = require('fs');
const path = require('path');
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const tz = env.TZ || 'America/Sao_Paulo';
const hora = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(d));
const horas = Number(process.env.HORAS) || 48;
const start = new Date(Date.now() - horas * 3600_000).toISOString();
const ha = env.HA_URL.replace(/\/$/, '');
const auth = { headers: { Authorization: 'Bearer ' + env.HA_TOKEN } };

(async () => {
  const states = await (await fetch(ha + '/api/states', auth)).json();
  const weights = states.filter((s) => s.entity_id.startsWith('sensor.') && s.entity_id.endsWith('_cat_weight'));
  if (!weights.length) return console.log('Não encontrei a caixa de areia (sensor …_cat_weight) no Home Assistant.');
  const prefix = weights[0].entity_id.slice('sensor.'.length, -'_cat_weight'.length);
  const ids = states.map((s) => s.entity_id).filter((id) => id.split('.')[1].startsWith(prefix + '_'));

  // 1) O que a caixa mandou (histórico do Home Assistant)
  const url = `${ha}/api/history/period/${start}?filter_entity_id=${ids.join(',')}&no_attributes&significant_changes_only=0`;
  const hist = await (await fetch(url, auth)).json();
  const rows = [];
  for (const serie of hist) for (const s of serie) rows.push([s.last_changed, s.entity_id.split('.')[1].slice(prefix.length + 1), s.state]);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`== O que a caixa mandou ao Home Assistant (últimas ${horas} h) ==`);
  let prev = {};
  for (const [t, k, v] of rows) {
    if (prev[k] === v) continue;
    prev[k] = v;
    console.log(`${hora(t)}  ${k.padEnd(22)} ${v}`);
  }

  // 2) O que a Luna registrou
  console.log(`\n== Visitas registradas pela Luna (últimas ${horas} h) ==`);
  try {
    const url0 = env.DATABASE_URL || 'file:./data/luna.db';
    const rel = url0.replace(/^file:/, '');
    const candidates = [rel, path.join('apps/api', rel), path.join('apps/api/prisma', rel)].map((p) => path.resolve(p));
    const db = candidates.find((p) => fs.existsSync(p));
    if (!db) throw new Error('banco da Luna não encontrado');
    const { PrismaClient } = require(path.resolve('node_modules/@prisma/client'));
    const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + db } } });
    const visits = await prisma.litterVisit.findMany({ where: { at: { gte: new Date(start) } }, orderBy: { at: 'asc' }, include: { cat: true } });
    for (const v of visits) console.log(`${hora(v.at)}  peso=${v.weightKg ?? '-'} kg  duração=${v.durationS ?? '-'} s  gato=${v.cat?.name ?? '(não reconhecido)'}`);
    if (!visits.length) console.log('(nenhuma)');
    const cats = await prisma.litterCat.findMany({ orderBy: { slot: 'asc' } });
    console.log('\n== Gatos e peso de referência ==');
    for (const c of cats) console.log(`${c.name.padEnd(10)} ${c.weightKg ?? '(aprendendo)'} kg${c.weightSet ? ' (informado)' : ''}`);
    await prisma.$disconnect();
  } catch (e) {
    console.log('Não consegui ler as visitas da Luna:', e.message);
  }
})().catch((e) => { console.log('Erro:', e.message); process.exit(1); });
JS
