#!/usr/bin/env bash
# Funções compartilhadas pelos scripts da Luna AI. Não execute diretamente.
set -euo pipefail

LUNA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LUNA_SERVICE="luna-ai"
NODE_MIN_MAJOR=20
NODE_MIN_MINOR=12
NODE_INSTALL_VERSION="${NODE_INSTALL_VERSION:-22.22.0}"

if [ -t 1 ]; then C_G=$'\e[32m'; C_Y=$'\e[33m'; C_R=$'\e[31m'; C_B=$'\e[36m'; C_0=$'\e[0m'; else C_G=; C_Y=; C_R=; C_B=; C_0=; fi
info() { printf '%s\n' "${C_B}›${C_0} $*"; }
ok()   { printf '%s\n' "${C_G}✓${C_0} $*"; }
warn() { printf '%s\n' "${C_Y}!${C_0} $*" >&2; }
fail() { printf '%s\n' "${C_R}✗${C_0} $*" >&2; exit 1; }

# Lê uma variável do .env sem executá-lo (seguro contra conteúdo arbitrário)
env_get() {
  local key="$1" file="${LUNA_ENV_FILE:-$LUNA_ROOT/.env}"
  [ -f "$file" ] || return 0
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# Altera/adiciona uma variável no .env
env_set() {
  local key="$1" value="$2" file="${LUNA_ENV_FILE:-$LUNA_ROOT/.env}"
  if grep -qE "^${key}=" "$file"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {print k"="v; next} {print}' "$file" > "$tmp" && cat "$tmp" > "$file" && rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# Usa o Node embarcado (runtime/node) se existir; senão, o do sistema
use_node() {
  if [ -x "$LUNA_ROOT/runtime/node/bin/node" ]; then
    export PATH="$LUNA_ROOT/runtime/node/bin:$PATH"
  fi
  command -v node >/dev/null 2>&1 || return 1
  NODE_BIN="$(command -v node)"
  export NODE_BIN
}

node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v major minor
  v="$(node -p 'process.versions.node' 2>/dev/null)" || return 1
  major="${v%%.*}"; minor="$(echo "$v" | cut -d. -f2)"
  [ "$major" -gt "$NODE_MIN_MAJOR" ] || { [ "$major" -eq "$NODE_MIN_MAJOR" ] && [ "$minor" -ge "$NODE_MIN_MINOR" ]; }
}

luna_port() { local p; p="$(env_get LUNA_PORT)"; echo "${p:-8787}"; }

data_dir() {
  local url; url="$(env_get DATABASE_URL)"; url="${url#file:}"
  [ -z "$url" ] && url="./data/luna.db"
  case "$url" in /*) dirname "$url" ;; *) dirname "$LUNA_ROOT/${url#./}" ;; esac
}

has_systemd_unit() { command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${LUNA_SERVICE}.service" 2>/dev/null | grep -q "$LUNA_SERVICE"; }
has_user_unit() { command -v systemctl >/dev/null 2>&1 && systemctl --user list-unit-files "${LUNA_SERVICE}.service" 2>/dev/null | grep -q "$LUNA_SERVICE"; }
has_pm2_app() { command -v pm2 >/dev/null 2>&1 && pm2 describe "$LUNA_SERVICE" >/dev/null 2>&1; }

as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; elif command -v sudo >/dev/null 2>&1; then sudo "$@"; else fail "Requer root para: $*"; fi; }

http_get() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then curl -fsS -m 5 "$url"
  elif command -v wget >/dev/null 2>&1; then wget -qO- -T 5 "$url"
  else node -e "fetch(process.argv[1]).then(r=>r.ok?r.text():Promise.reject(r.status)).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))" "$url"; fi
}

http_status() {
  local url="$1"
  local code
  if command -v curl >/dev/null 2>&1; then code="$(curl -s -o /dev/null -m 4 -w '%{http_code}' "$url" 2>/dev/null || true)"; echo "${code:-000}"
  else echo "?"; fi
}
