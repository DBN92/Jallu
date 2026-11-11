#!/usr/bin/env bash
# Lista entidades do Home Assistant para adaptar a Luna a um aparelho (somente leitura).
# Uso:
#   sudo bash scripts/diagnostico.sh areia      # caixa de areia (Smart Life/Tuya, New Pet…)
#   sudo bash scripts/diagnostico.sh robo       # aspirador robô
#   sudo bash scripts/diagnostico.sh lavadora   # lava e seca (Midea AC LAN)
#   sudo bash scripts/diagnostico.sh "termo"    # qualquer outro termo (nome do aparelho)
# Não mostra o token. Mande a saída para a Luna ser ajustada ao seu modelo.
set -euo pipefail
cd "$(dirname "$0")/.."
NODE=./runtime/node/bin/node
[ -x "$NODE" ] || NODE=node
[ -f .env ] || { echo "Arquivo .env não encontrado em $(pwd)"; exit 1; }

case "${1:-robo}" in
  robo|robô|aspirador) TERMS='vacuum|aspir|robo|robô|robot|sweep|limp|clean|xiaomi|mijia|dreame|roborock|neatsvor|mop|esfreg|base|dock|escova|brush|sucç|succ' ;;
  areia|caixa|gato|gatos) TERMS='litter|toilet|areia|caixa|gato|cat_|cat |excretion|new ?pet|newpet|bag_full|manual_clean|auto_clean|delay_clean|(?<![a-z])pet' ;;
  lavadora|lava|maquina|máquina|midea) TERMS='washer|dryer|laundry|lava|seca|midea'; INTEGRATION='midea_ac_lan' ;;
  *) TERMS="$1" ;;
esac
export DIAG_TERMS="$TERMS"
export DIAG_INTEGRATION="${INTEGRATION:-}"

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
const HA = env.HA_URL.replace(/\/$/, '');
const headers = { Authorization: 'Bearer ' + env.HA_TOKEN, 'Content-Type': 'application/json' };
// Entidades criadas por uma integração (os nomes da Midea AC LAN usam só o número do aparelho)
async function fromIntegration(domain) {
  if (!domain) return new Set();
  try {
    const r = await fetch(HA + '/api/template', { method: 'POST', headers, body: JSON.stringify({ template: `{{ integration_entities('${domain}') | join(',') }}` }) });
    if (!r.ok) return new Set();
    return new Set((await r.text()).split(',').map((x) => x.trim()).filter(Boolean));
  } catch { return new Set(); }
}
Promise.all([
  fetch(HA + '/api/states', { headers }).then((r) => { if (!r.ok) throw new Error('Home Assistant respondeu ' + r.status); return r.json(); }),
  fromIntegration(process.env.DIAG_INTEGRATION),
])
  .then(([states, own]) => {
    const hits = states.filter((s) => (own.has(s.entity_id) || words.test(s.entity_id + ' ' + (s.attributes.friendly_name || ''))) && !/^(automation|script|update|person|zone)\./.test(s.entity_id));
    console.log(`Encontradas ${hits.length} entidades:\n`);
    for (const s of hits.sort((a, b) => a.entity_id.localeCompare(b.entity_id))) {
      const a = s.attributes;
      const extra = [a.unit_of_measurement && `unidade=${a.unit_of_measurement}`, a.device_class && `tipo=${a.device_class}`].filter(Boolean).join(' ');
      console.log(`${s.entity_id}  |  ${s.state}  |  ${a.friendly_name || ''}${extra ? '  |  ' + extra : ''}`);
      if (s.entity_id.startsWith('vacuum.') || s.entity_id.startsWith('select.')) {
        console.log(`    recursos=${a.supported_features ?? '-'} potência=${a.fan_speed ?? '-'} opções=${JSON.stringify(a.fan_speed_list ?? a.options ?? [])}`);
      }
      if (s.entity_id.startsWith('number.')) console.log(`    mín=${a.min ?? '-'} máx=${a.max ?? '-'} passo=${a.step ?? '-'}`);
      if (process.env.DIAG_INTEGRATION) {
        const rest = Object.keys(a).filter((k) => !['friendly_name', 'unit_of_measurement', 'device_class', 'icon', 'state_class'].includes(k));
        if (rest.length) console.log(`    atributos=${JSON.stringify(Object.fromEntries(rest.map((k) => [k, a[k]])))}`);
      }
    }
    if (!hits.length) console.log('Nada encontrado. Confira se o aparelho aparece no Home Assistant (Configurações › Dispositivos) ou tente com o nome dele: sudo bash scripts/diagnostico.sh "nome"');
  })
  .catch((e) => { console.log('Erro:', e.message); process.exit(1); });
JS
