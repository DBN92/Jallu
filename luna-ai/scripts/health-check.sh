#!/usr/bin/env bash
# Verifica se a Luna responde localmente (e, opcionalmente, pelo domínio público).
# Uso: scripts/health-check.sh [--public]
source "$(dirname "$0")/lib.sh"
PORT="$(luna_port)"
if body="$(http_get "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"; then
  ok "Luna respondendo em http://127.0.0.1:$PORT — $body"
else
  fail "A Luna não respondeu em http://127.0.0.1:$PORT. Veja os logs: journalctl -u $LUNA_SERVICE -n 50 (ou pm2 logs $LUNA_SERVICE)"
fi
if [ "${1:-}" = "--public" ]; then
  PUB="$(env_get LUNA_PUBLIC_URL)"
  [ -n "$PUB" ] || fail "LUNA_PUBLIC_URL não definido no .env"
  code="$(http_status "$PUB/api/health")"
  case "$code" in
    200) ok "Acessível pela internet em $PUB" ;;
    302|403) ok "Domínio $PUB protegido (HTTP $code — provavelmente Cloudflare Access, esperado)" ;;
    *) fail "Domínio $PUB respondeu HTTP $code. Confira o hostname público no Cloudflare Tunnel." ;;
  esac
fi
