#!/usr/bin/env bash
# Instalação nativa da Luna AI (sem Docker). Seguro para rodar novamente (idempotente).
#
# Uso: bash scripts/install.sh [opções]
#   --service systemd|user|pm2|none   Como manter a Luna rodando (padrão: systemd se possível)
#   --user NOME                       Usuário Linux do serviço (padrão: "luna", criado se você for root)
#   --data-dir DIR                    Pasta do banco/dados (padrão: /DATA/AppData/luna-ai ou ./data)
#   --skip-diagnose                   Não executa o diagnóstico inicial
#   -y, --yes                         Não pergunta confirmações
source "$(dirname "$0")/lib.sh"

SERVICE=""; SVC_USER=""; DATA_DIR=""; ASSUME_YES=0; SKIP_DIAG=0
while [ $# -gt 0 ]; do
  case "$1" in
    --service) SERVICE="$2"; shift 2 ;;
    --user) SVC_USER="$2"; shift 2 ;;
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    --skip-diagnose) SKIP_DIAG=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) fail "Opção desconhecida: $1" ;;
  esac
done

confirm() { [ "$ASSUME_YES" = 1 ] && return 0; read -r -p "$1 [s/N] " a; [[ "$a" =~ ^[sSyY] ]]; }
IS_ROOT=0; [ "$(id -u)" -eq 0 ] && IS_ROOT=1
cd "$LUNA_ROOT"

# 1) Diagnóstico
if [ "$SKIP_DIAG" = 0 ]; then bash "$LUNA_ROOT/scripts/diagnose.sh" || true; echo; fi
confirm "Prosseguir com a instalação da Luna em $LUNA_ROOT?" || exit 0

# 2) Node.js (instalado localmente em runtime/ se necessário — não altera o sistema)
use_node || true
if ! node_version_ok; then
  case "$(uname -m)" in
    x86_64|amd64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; armv7l) ARCH=armv7l ;;
    *) fail "Arquitetura $(uname -m) não suportada pelos binários oficiais do Node." ;;
  esac
  if ldd --version 2>&1 | grep -qi musl; then fail "Sistema com musl libc: instale Node >= 20.12 manualmente (unofficial-builds.nodejs.org)."; fi
  V="$NODE_INSTALL_VERSION"; NAME="node-v$V-linux-$ARCH"
  info "Instalando Node.js v$V ($ARCH) em $LUNA_ROOT/runtime/node…"
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  for f in "$NAME.tar.xz" SHASUMS256.txt; do
    if command -v curl >/dev/null; then curl -fsSL -o "$TMP/$f" "https://nodejs.org/dist/v$V/$f"; else wget -qO "$TMP/$f" "https://nodejs.org/dist/v$V/$f"; fi
  done
  (cd "$TMP" && grep " $NAME.tar.xz\$" SHASUMS256.txt | sha256sum -c -) >/dev/null || fail "Falha na verificação SHA-256 do Node."
  rm -rf "$LUNA_ROOT/runtime/node"; mkdir -p "$LUNA_ROOT/runtime"
  tar -xJf "$TMP/$NAME.tar.xz" -C "$LUNA_ROOT/runtime" && mv "$LUNA_ROOT/runtime/$NAME" "$LUNA_ROOT/runtime/node"
  use_node; ok "Node $(node -v) instalado (local)"
else
  ok "Node $(node -v) ($NODE_BIN)"
fi

# 3) Pasta de dados (fora da pasta de build)
if [ -z "$DATA_DIR" ]; then
  existing="$(env_get DATABASE_URL)"
  if [ -n "$existing" ]; then DATA_DIR="$(data_dir)"
  elif [ -d /DATA/AppData ] && [ -w /DATA/AppData ]; then DATA_DIR=/DATA/AppData/luna-ai
  else DATA_DIR="$LUNA_ROOT/data"; fi
fi
mkdir -p "$DATA_DIR" "$DATA_DIR/backups" && chmod 700 "$DATA_DIR"
ok "Dados em $DATA_DIR"

# 4) .env (nunca sobrescreve um existente)
if [ ! -f .env ]; then
  cp .env.example .env
  CODE="$(node -e 'console.log(require("crypto").randomBytes(9).toString("base64url"))')"
  env_set LUNA_SETUP_CODE "$CODE"
  env_set DATABASE_URL "file:$DATA_DIR/luna.db"
  env_set LUNA_PUBLIC_URL ""
  chmod 600 .env
  ok ".env criado (permissão 600). Código de configuração: $CODE"
else
  ok ".env existente preservado"
  [ "$(env_get DATABASE_URL)" ] || env_set DATABASE_URL "file:$DATA_DIR/luna.db"
fi

# 5) Build e banco
bash "$LUNA_ROOT/scripts/build.sh"
info "Aplicando migrações do banco…"
node apps/api/scripts/migrate.mjs

# 6) Usuário dedicado (sem privilégios administrativos)
if [ -z "$SVC_USER" ]; then
  if [ "$IS_ROOT" = 1 ]; then SVC_USER=luna; else SVC_USER="$(id -un)"; fi
fi
if [ "$IS_ROOT" = 1 ] && ! id "$SVC_USER" >/dev/null 2>&1; then
  if command -v useradd >/dev/null 2>&1; then useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$SVC_USER" 2>/dev/null || useradd -r -d "$DATA_DIR" -s /bin/false "$SVC_USER"
  elif command -v adduser >/dev/null 2>&1; then adduser -S -H -h "$DATA_DIR" -s /bin/false "$SVC_USER"
  else warn "Não consegui criar o usuário $SVC_USER; o serviço rodará como root."; SVC_USER=root; fi
  id "$SVC_USER" >/dev/null 2>&1 && ok "Usuário de serviço '$SVC_USER' criado"
fi
SVC_GROUP="$(id -gn "$SVC_USER" 2>/dev/null || echo "$SVC_USER")"
if [ "$IS_ROOT" = 1 ] && [ "$SVC_USER" != root ]; then
  chown -R "$SVC_USER:$SVC_GROUP" "$DATA_DIR"
  chown "$SVC_USER:$SVC_GROUP" .env && chmod 600 .env
  if ! su -s /bin/sh "$SVC_USER" -c "test -r '$LUNA_ROOT/apps/api/dist/server.js'" 2>/dev/null; then
    warn "O usuário $SVC_USER não consegue ler $LUNA_ROOT. Mova o projeto para /DATA/AppData/luna-ai/app (ou /opt/luna-ai) ou use --user $(id -un)."
  fi
fi

# 7) Execução persistente
if [ -z "$SERVICE" ]; then
  if command -v systemctl >/dev/null 2>&1 && [ "$IS_ROOT" = 1 ] && [ -w /etc/systemd/system ]; then SERVICE=systemd
  elif command -v systemctl >/dev/null 2>&1 && [ "$IS_ROOT" = 0 ]; then SERVICE=user
  else SERVICE=pm2; fi
fi
render_unit() {
  sed -e "s#@ROOT@#$LUNA_ROOT#g" -e "s#@USER@#$1#g" -e "s#@GROUP@#$2#g" -e "s#@NODE@#$NODE_BIN#g" -e "s#@DATA@#$DATA_DIR#g" -e "s#@WANTEDBY@#$3#g" \
    "$LUNA_ROOT/infra/systemd/luna-ai.service.template"
}
case "$SERVICE" in
  systemd)
    [ "$IS_ROOT" = 1 ] || fail "--service systemd requer root (use sudo) ou --service user"
    UNIT=/etc/systemd/system/luna-ai.service
    [ -f "$UNIT" ] && cp "$UNIT" "$UNIT.bak.$(date +%s)" && info "Backup do serviço anterior criado"
    render_unit "$SVC_USER" "$SVC_GROUP" multi-user.target > "$UNIT"
    systemctl daemon-reload
    systemctl enable --now luna-ai >/dev/null 2>&1 || systemctl restart luna-ai
    systemctl restart luna-ai
    ok "Serviço systemd 'luna-ai' habilitado (inicia junto com o servidor)"
    ;;
  user)
    mkdir -p "$HOME/.config/systemd/user"
    render_unit "$SVC_USER" "$SVC_GROUP" default.target | grep -vE '^(User|Group)=' > "$HOME/.config/systemd/user/luna-ai.service"
    systemctl --user daemon-reload && systemctl --user enable --now luna-ai
    loginctl enable-linger "$(id -un)" 2>/dev/null || warn "Rode 'sudo loginctl enable-linger $(id -un)' para iniciar no boot sem login."
    ok "Serviço systemd de usuário habilitado"
    ;;
  pm2)
    if ! command -v pm2 >/dev/null 2>&1; then
      info "Instalando PM2 localmente em runtime/pm2…"
      npm install --prefix "$LUNA_ROOT/runtime/pm2" pm2@6 --no-audit --no-fund --loglevel=error
      export PATH="$LUNA_ROOT/runtime/pm2/node_modules/.bin:$PATH"
    fi
    LUNA_NODE="$NODE_BIN" pm2 start infra/linux/ecosystem.config.cjs --update-env
    pm2 save
    warn "Para iniciar no boot, rode o comando que o PM2 imprimir com: pm2 startup"
    ;;
  none) warn "Nenhum serviço instalado. Use scripts/start.sh manualmente." ;;
  *) fail "--service inválido: $SERVICE" ;;
esac

sleep 3
bash "$LUNA_ROOT/scripts/health-check.sh" || warn "A Luna ainda não respondeu; verifique os logs."

PORT="$(luna_port)"; IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<MSG

${C_G}Luna AI instalada!${C_0}
  • Rede local:  http://${IP:-<ip-do-servidor>}:$PORT   (microfone/GPS exigem HTTPS → use o domínio do Cloudflare)
  • Código para criar o administrador: $(env_get LUNA_SETUP_CODE)

Próximos passos:
  1. Edite $LUNA_ROOT/.env: HA_URL, HA_TOKEN, OPENAI_API_KEY (opcional), OLLAMA_MODEL, LUNA_PUBLIC_URL
     e reinicie com: bash scripts/stop.sh && bash scripts/start.sh
  2. Publique pelo Cloudflare Tunnel existente: veja docs/CLOUDFLARE.md
  3. Abra o domínio no Safari do iPhone → Compartilhar → Adicionar à Tela de Início.
MSG
