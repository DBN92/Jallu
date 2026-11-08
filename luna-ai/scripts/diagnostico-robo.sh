#!/usr/bin/env bash
# Lista as entidades do Home Assistant que parecem ser de aspirador robô (somente leitura).
# Uso: sudo bash scripts/diagnostico-robo.sh
# Não mostra o token. Mande a saída para ajustar a DIA ao seu modelo.
set -euo pipefail
cd "$(dirname "$0")/.."
NODE=./runtime/node/bin/node
[ -x "$NODE" ] || NODE=node
[ -f .env ] || { echo "Arquivo .env não encontrado em $(pwd)"; exit 1; }

"$NODE" - <<'JS'
const fs = require('fs');
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!env.HA_URL || !env.HA_TOKEN) { console.log('HA_URL/HA_TOKEN não configurados no .env'); process.exit(1); }
const words = /vacuum|aspir|robo|robô|robot|sweep|limp|clean|xiaomi|mijia|dreame|roborock|neatsvor|mop|esfreg|base|dock|escova|brush|sucç|succ/i;
fetch(env.HA_URL.replace(/\/$/, '') + '/api/states', { headers: { Authorization: 'Bearer ' + env.HA_TOKEN } })
  .then((r) => { if (!r.ok) throw new Error('Home Assistant respondeu ' + r.status); return r.json(); })
  .then((states) => {
    const hits = states.filter((s) => words.test(s.entity_id + ' ' + (s.attributes.friendly_name || '')) && !/^(automation|script|update|person|zone)\./.test(s.entity_id));
    console.log(`Encontradas ${hits.length} entidades:\n`);
    for (const s of hits.sort((a, b) => a.entity_id.localeCompare(b.entity_id))) {
      console.log(`${s.entity_id}  |  ${s.state}  |  ${s.attributes.friendly_name || ''}`);
      if (s.entity_id.startsWith('vacuum.') || s.entity_id.startsWith('select.')) {
        const a = s.attributes;
        console.log(`    recursos=${a.supported_features ?? '-'} potência=${a.fan_speed ?? '-'} opções=${JSON.stringify(a.fan_speed_list ?? a.options ?? [])}`);
      }
    }
    if (!hits.some((s) => s.entity_id.startsWith('vacuum.'))) console.log('\n⚠ Nenhuma entidade vacuum.* — a integração criou o robô só como botões/sensores.');
  })
  .catch((e) => { console.log('Erro:', e.message); process.exit(1); });
JS
