#!/usr/bin/env bash
# Compara a velocidade de modelos do Ollama NESTE servidor (o mesmo que a Luna usa, pelo OLLAMA_URL do .env).
# Baixa o modelo se faltar, faz 3 perguntas parecidas com as da Luna e mostra o tempo de cada um.
# Uso: bash scripts/ollama-bench.sh qwen2.5:1.5b qwen2.5:3b
source "$(dirname "$0")/lib.sh"
use_node || fail "Node.js não encontrado."
URL="$(grep -E '^OLLAMA_URL=' "$LUNA_ROOT/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' )"
URL="${URL:-http://127.0.0.1:11434}"
[ "$#" -gt 0 ] || set -- qwen2.5:1.5b qwen2.5:3b
info "Ollama em $URL"
node - "$URL" "$@" <<'JS'
const [url, ...models] = process.argv.slice(2);
// Instruções do tamanho das da Luna (o que mais pesa num processador antigo é ler isto)
const system = 'Você é a Luna, assistente da casa. Responda em português do Brasil, em no máximo duas frases curtas. '.repeat(25);
const perguntas = ['Explique em uma frase o que é a Lua.', 'Me dê uma ideia de jantar rápido.', 'Qual a diferença entre chuva e garoa?'];
const s = (ns) => (ns / 1e9).toFixed(1);
(async () => {
  for (const model of models) {
    process.stdout.write(`\n== ${model} ==\n`);
    const have = await fetch(`${url}/api/show`, { method: 'POST', body: JSON.stringify({ model }) });
    if (!have.ok) {
      process.stdout.write('baixando (só desta vez)…\n');
      const p = await fetch(`${url}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: false }) });
      if (!p.ok) { console.log(`não consegui baixar: ${await p.text()}`); continue; }
    }
    // carrega o modelo na memória (não conta no tempo)
    await fetch(`${url}/api/generate`, { method: 'POST', body: JSON.stringify({ model, prompt: 'oi', stream: false, options: { num_predict: 1 } }) });
    for (const [i, q] of perguntas.entries()) {
      const t0 = Date.now();
      const r = await (await fetch(`${url}/api/chat`, { method: 'POST', body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: q }], options: { num_ctx: 4096, num_predict: 120 } }) })).json();
      const total = ((Date.now() - t0) / 1000).toFixed(1);
      const ler = r.prompt_eval_count ? `ler ${r.prompt_eval_count} tokens em ${s(r.prompt_eval_duration)} s` : 'instruções já em cache';
      console.log(`${i + 1}) ${total} s no total · ${ler} · escrever ${(r.eval_count / (r.eval_duration / 1e9)).toFixed(1)} tokens/s`);
      console.log(`   “${(r.message?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)}”`);
    }
  }
  console.log('\nMande este resultado para comparar. Menos segundos = mais rápido; leia as respostas para ver a qualidade.');
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
JS
