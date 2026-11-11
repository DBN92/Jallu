#!/usr/bin/env bash
# Lista entidades do Home Assistant para adaptar a DIA a um aparelho (somente leitura).
# Uso:
#   sudo bash scripts/diagnostico.sh areia      # caixa de areia (Smart Life/Tuya, New Pet…)
#   sudo bash scripts/diagnostico.sh robo       # aspirador robô
#   sudo bash scripts/diagnostico.sh "termo"    # qualquer outro termo (nome do aparelho)
# Não mostra o token. Mande a saída para a DIA ser ajustada ao seu modelo.
set -euo pipefail
cd "$(dirname "$0")/.."
NODE=./runtime/node/bin/node
[ -x "$NODE" ] || NODE=node
[ -f .env ] || { echo "Arquivo .env não encontrado em $(pwd)"; exit 1; }

case "${1:-robo}" in
  robo|robô|aspirador) TERMS='vacuum|aspir|robo|robô|robot|sweep|limp|clean|xiaomi|mijia|dreame|roborock|neatsvor|mop|esfreg|base|dock|escova|brush|sucç|succ' ;;
  areia|caixa|gato|gatos) TERMS='litter|toilet|areia|caixa|gato|cat_|cat |excretion|new ?pet|newpet|bag_full|manual_clean|auto_clean|delay_clean|(?<![a-z])pet' ;;
  *) TERMS="$1" ;;
esac
export DIAG_TERMS="$TERMS"

"$NODE" - <<'JS'
const fs = require('fs');
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!env.HA_URL || !env.HA_TOKEN) { console.log('HA_URL/HA_TOKEN não configurados no .env'); process.exit(1); }
let words;
try { words = new RegExp(process.env.DIAG_TERMS, 'i'); } catch { console.log('Termo de busca inválido.'); process.exit(1); }
fetch(env.HA_URL.replace(/\/$/, '') + '/api/states', { headers: { Authorization: 'Bearer ' + env.HA_TOKEN } })
  .then((r) => { if (!r.ok) throw new Error('Home Assistant respondeu ' + r.status); return r.json(); })
  .then((states) => {
    const hits = states.filter((s) => words.test(s.entity_id + ' ' + (s.attributes.friendly_name || '')) && !/^(automation|script|update|person|zone)\./.test(s.entity_id));
    console.log(`Encontradas ${hits.length} entidades:\n`);
    for (const s of hits.sort((a, b) => a.entity_id.localeCompare(b.entity_id))) {
      const a = s.attributes;
      const extra = [a.unit_of_measurement && `unidade=${a.unit_of_measurement}`, a.device_class && `tipo=${a.device_class}`].filter(Boolean).join(' ');
      console.log(`${s.entity_id}  |  ${s.state}  |  ${a.friendly_name || ''}${extra ? '  |  ' + extra : ''}`);
      if (s.entity_id.startsWith('vacuum.') || s.entity_id.startsWith('select.')) {
        console.log(`    recursos=${a.supported_features ?? '-'} potência=${a.fan_speed ?? '-'} opções=${JSON.stringify(a.fan_speed_list ?? a.options ?? [])}`);
      }
      if (s.entity_id.startsWith('number.')) console.log(`    mín=${a.min ?? '-'} máx=${a.max ?? '-'} passo=${a.step ?? '-'}`);
    }
    if (!hits.length) console.log('Nada encontrado. Confira se o aparelho aparece no Home Assistant (Configurações › Dispositivos) ou tente com o nome dele: sudo bash scripts/diagnostico.sh "nome"');
  })
  .catch((e) => { console.log('Erro:', e.message); process.exit(1); });
JS
