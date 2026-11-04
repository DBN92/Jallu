#!/usr/bin/env bash
# Assistente interativo para preencher o .env da Luna (HA, domínio, OpenAI) e reiniciar o serviço.
# Uso: sudo bash scripts/configure.sh
source "$(dirname "$0")/lib.sh"
cd "$LUNA_ROOT"
[ -f .env ] || fail "Arquivo .env não encontrado. Rode primeiro: sudo bash scripts/install.sh"
[ -w .env ] || fail "Sem permissão para editar o .env. Rode com sudo: sudo bash scripts/configure.sh"

ask() { # pergunta com valor atual como padrão
  local label="$1" current="$2" answer
  read -r -p "$label [${current:-vazio}]: " answer
  echo "${answer:-$current}"
}
ask_secret() { # entrada oculta; Enter mantém o valor atual
  local label="$1" current="$2" answer
  read -r -s -p "$label [$( [ -n "$current" ] && echo 'já definido — Enter mantém' || echo 'vazio')]: " answer; echo >&2
  echo "${answer:-$current}"
}

echo
info "1/3 — Home Assistant"
HA_URL="$(ask 'Endereço do Home Assistant' "$(env_get HA_URL)")"; HA_URL="${HA_URL%/}"
echo "   Crie o token no HA: clique no seu nome (canto inferior esquerdo) › aba Segurança ›"
echo "   'Tokens de acesso de longa duração' › Criar token › nome 'Luna' › copie o código."
HA_TOKEN="$(ask_secret 'Cole o token do Home Assistant' "$(env_get HA_TOKEN)")"
if [ -n "$HA_TOKEN" ]; then
  code="$(curl -s -o /dev/null -m 8 -w '%{http_code}' -H "Authorization: Bearer $HA_TOKEN" "$HA_URL/api/" || true)"
  case "$code" in
    200) ok "Token válido — a Luna consegue falar com o Home Assistant" ;;
    401) fail "O Home Assistant recusou o token (401). Copie-o novamente — ele só aparece uma vez." ;;
    *) warn "Não consegui testar o token (HTTP ${code:-sem resposta}). Verifique o endereço $HA_URL" ;;
  esac
fi

echo
info "2/3 — Endereço público (Cloudflare)"
echo "   Ex.: https://luna.seudominio.com — deixe vazio se ainda não configurou o túnel."
PUB="$(ask 'Endereço público da Luna' "$(env_get LUNA_PUBLIC_URL)")"; PUB="${PUB%/}"
if [ -n "$PUB" ] && [[ "$PUB" != https://* ]]; then PUB="https://${PUB#http://}"; fi

echo
info "3/3 — OpenAI (opcional: conversa avançada e voz em tempo real)"
echo "   Chave em https://platform.openai.com/api-keys (começa com sk-). Enter para pular."
OPENAI="$(ask_secret 'Chave da OpenAI' "$(env_get OPENAI_API_KEY)")"

env_set HA_URL "$HA_URL"
env_set HA_TOKEN "$HA_TOKEN"
env_set LUNA_PUBLIC_URL "$PUB"
env_set OPENAI_API_KEY "$OPENAI"
chmod 600 .env
ok "Configuração salva em $LUNA_ROOT/.env"

echo
info "Reiniciando a Luna…"
bash "$LUNA_ROOT/scripts/stop.sh" >/dev/null 2>&1 || true
bash "$LUNA_ROOT/scripts/start.sh"
