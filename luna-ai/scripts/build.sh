#!/usr/bin/env bash
# Instala dependências e compila API + PWA.
source "$(dirname "$0")/lib.sh"
use_node || fail "Node.js não encontrado. Rode scripts/install.sh primeiro."
node_version_ok || fail "Node $(node -v) é antigo. Rode scripts/install.sh para instalar uma versão compatível."
cd "$LUNA_ROOT"
# Eleva o limite de arquivos abertos até o máximo permitido (o build abre muitos arquivos)
ulimit -n "$(ulimit -Hn)" 2>/dev/null || ulimit -n 4096 2>/dev/null || true
info "Limite de arquivos abertos: $(ulimit -n)"
export PRISMA_HIDE_UPDATE_MESSAGE=1 NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
info "Instalando dependências (npm ci)…"
npm ci --no-audit --no-fund --loglevel=error
# Modelo do reconhecedor de gestos (IA de visão do Google MediaPipe, ~8 MB, roda no aparelho)
MODEL="apps/web/public/models/gesture_recognizer.task"
MODEL_SHA="97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482"
sha_of() { node -e "const c=require('crypto').createHash('sha256');c.update(require('fs').readFileSync(process.argv[1]));console.log(c.digest('hex'))" "$1"; }
if [ ! -f "$MODEL" ] || [ "$(sha_of "$MODEL")" != "$MODEL_SHA" ]; then
  info "Baixando o modelo de gestos (~8 MB)…"
  mkdir -p "$(dirname "$MODEL")"
  if node -e "fetch(process.argv[1]).then(async r=>{if(!r.ok)process.exit(1);require('fs').writeFileSync(process.argv[2],Buffer.from(await r.arrayBuffer()))}).catch(()=>process.exit(1))" \
      "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task" "$MODEL.tmp" \
      && [ "$(sha_of "$MODEL.tmp")" = "$MODEL_SHA" ]; then mv -f "$MODEL.tmp" "$MODEL"; ok "Modelo de gestos pronto"
  else rm -f "$MODEL.tmp"; warn "Não consegui baixar o modelo de gestos — comandos por mão ficam indisponíveis (o resto funciona)."; fi
fi
info "Compilando API e PWA…"
npm run build --silent
[ -f apps/api/dist/server.js ] || fail "Build da API não gerou apps/api/dist/server.js"
[ -f apps/web/dist/index.html ] || fail "Build do PWA não gerou apps/web/dist/index.html"
ok "Build concluído"
