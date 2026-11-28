#!/usr/bin/env bash
# Compara a velocidade de modelos do Ollama NESTE servidor (o mesmo que a Luna usa, pelo OLLAMA_URL do .env).
# Baixa o modelo se faltar, faz 3 perguntas parecidas com as da Luna e mostra o tempo de cada um.
# Uso: bash scripts/ollama-bench.sh qwen2.5:1.5b qwen2.5:3b
source "$(dirname "$0")/lib.sh"
use_node || fail "Node.js não encontrado."
# Mesmo endereço da Luna: OLLAMA_URL do .env ou o padrão (o .env pode não ter a linha)
URL="$(env_get OLLAMA_URL 2>/dev/null || true)"
URL="${URL:-http://127.0.0.1:11434}"
[ "$#" -gt 0 ] || set -- qwen2.5:1.5b qwen2.5:3b
info "Ollama em $URL"
curl -fsS -m 5 "$URL/api/version" >/dev/null 2>&1 || node -e "fetch(process.argv[1]+'/api/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$URL" || fail "O Ollama não respondeu em $URL. Ele está ligado? (a Luna usa o mesmo endereço)"
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
      // Em partes, mostrando o andamento (download grande não estoura o tempo de espera)
      const p = await fetch(`${url}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }) });
      if (!p.ok || !p.body) { console.log(`não consegui baixar: ${await p.text()}`); continue; }
      let buf = '', last = '', erro = '';
      for await (const chunk of p.body) {
        buf += Buffer.from(chunk).toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const j = JSON.parse(line);
          if (j.error) erro = j.error;
          const pct = j.total ? ` ${Math.floor((j.completed ?? 0) / j.total * 100)}%` : '';
          const msg = `${j.status ?? ''}${pct}`;
          if (msg !== last) { process.stdout.write(`\r  ${msg}`.padEnd(60)); last = msg; }
        }
      }
      process.stdout.write('\n');
      if (erro) { console.log(`não consegui baixar: ${erro}`); continue; }
    }
    // carrega o modelo na memória (não conta no tempo)
    await fetch(`${url}/api/generate`, { method: 'POST', body: JSON.stringify({ model, prompt: 'oi', stream: false, options: { num_predict: 1 } }) });
    for (const [i, q] of perguntas.entries()) {
      const t0 = Date.now();
      // Desliga o “pensar” (modelos de raciocínio gastam a resposta pensando); modelo sem essa opção: pede de novo sem ela
      const ask = async (think) => (await fetch(`${url}/api/chat`, { method: 'POST', body: JSON.stringify({ model, stream: false, ...(think === undefined ? {} : { think }), messages: [{ role: 'system', content: system }, { role: 'user', content: q }], options: { num_ctx: 4096, num_predict: 120 } }) })).json();
      let r = await ask(false);
      if (r.error) r = await ask(undefined);
      if (r.error) { console.log(`${i + 1}) erro: ${r.error}`); continue; }
      const total = ((Date.now() - t0) / 1000).toFixed(1);
      const ler = r.prompt_eval_count ? `ler ${r.prompt_eval_count} tokens em ${s(r.prompt_eval_duration)} s` : 'instruções já em cache';
      console.log(`${i + 1}) ${total} s no total · ${ler} · escrever ${(r.eval_count / (r.eval_duration / 1e9)).toFixed(1)} tokens/s`);
      const pensou = (r.message?.thinking ?? '').length + ((r.message?.content ?? '').match(/<think>[\s\S]*?(<\/think>|$)/)?.[0].length ?? 0);
      const texto = (r.message?.content ?? '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/\s+/g, ' ').trim();
      console.log(`   “${texto.slice(0, 160)}”${pensou ? `  (gastou ${pensou} caracteres “pensando”)` : ''}`);
    }
  }
  console.log('\nMande este resultado para comparar. Menos segundos = mais rápido; leia as respostas para ver a qualidade.');
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
JS
