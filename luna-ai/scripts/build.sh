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
info "Compilando API e PWA…"
npm run build --silent
[ -f apps/api/dist/server.js ] || fail "Build da API não gerou apps/api/dist/server.js"
[ -f apps/web/dist/index.html ] || fail "Build do PWA não gerou apps/web/dist/index.html"
ok "Build concluído"
