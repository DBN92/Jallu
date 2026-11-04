#!/usr/bin/env bash
# Instala o cloudflared NATIVO (sem Docker) como serviço systemd e conecta ao túnel EXISTENTE
# usando o token do painel Cloudflare. Não cria túnel novo. Não altera o Home Assistant.
# Uso: sudo bash scripts/cloudflared-setup.sh
source "$(dirname "$0")/lib.sh"
[ "$(id -u)" -eq 0 ] || fail "Rode com sudo: sudo bash scripts/cloudflared-setup.sh"

DIR="${CLOUDFLARED_DIR:-/DATA/AppData/cloudflared}"
BIN="$DIR/cloudflared"; TOKEN_FILE="$DIR/tunnel-token"; UNIT=/etc/systemd/system/cloudflared-luna.service

case "$(uname -m)" in x86_64|amd64) ARCH=amd64 ;; aarch64|arm64) ARCH=arm64 ;; *) fail "Arquitetura não suportada: $(uname -m)";; esac

# Aviso se já existir outro conector (ex.: app do ZimaOS) — dois conectores do mesmo túnel funcionam juntos
if command -v docker >/dev/null 2>&1 && docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}' 2>/dev/null | grep -i cloudflare; then
  warn "Há um contêiner do cloudflared acima (app do ZimaOS). Se ele estiver parado, você pode simplesmente iniciá-lo pelo painel do ZimaOS em vez de usar este script."
  read -r -p "Continuar com a instalação nativa mesmo assim? [s/N] " a; [[ "$a" =~ ^[sSyY] ]] || exit 0
fi

mkdir -p "$DIR" && chmod 700 "$DIR"
info "Baixando cloudflared ($ARCH)…"
curl -fsSL -o "$BIN.new" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARCH"
chmod 755 "$BIN.new" && "$BIN.new" --version >/dev/null && mv "$BIN.new" "$BIN"
ok "$("$BIN" --version | head -n1)"

echo
echo "Pegue o TOKEN do seu túnel existente:"
echo "  one.dash.cloudflare.com › Networks › Tunnels › (seu túnel) › Configure (ou Editar)"
echo "  Na seção de instalação do conector há um comando com '--token eyJ...'. Copie só a parte eyJ..."
if [ -s "$TOKEN_FILE" ]; then echo "  (Já existe um token salvo — Enter para mantê-lo)"; fi
read -r -s -p "Cole o token: " TOKEN; echo
if [ -n "$TOKEN" ]; then
  TOKEN="${TOKEN#*--token }"; TOKEN="$(echo "$TOKEN" | tr -d '[:space:]')"
  [[ "$TOKEN" == eyJ* ]] || fail "Isso não parece um token de túnel (deveria começar com eyJ)."
  umask 077; printf '%s' "$TOKEN" > "$TOKEN_FILE"; chmod 600 "$TOKEN_FILE"
fi
[ -s "$TOKEN_FILE" ] || fail "Nenhum token informado."

cat > "$UNIT" <<UNITEOF
[Unit]
Description=Cloudflare Tunnel (conector nativo)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$BIN --no-autoupdate tunnel run --token-file $TOKEN_FILE
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable --now cloudflared-luna >/dev/null 2>&1 || true
systemctl restart cloudflared-luna
sleep 6
if journalctl -u cloudflared-luna -n 50 --no-pager 2>/dev/null | grep -q "Registered tunnel connection"; then
  ok "Túnel conectado! No painel do Cloudflare ele deve aparecer como HEALTHY."
else
  warn "Ainda não vi a conexão registrada. Últimas linhas do log:"
  journalctl -u cloudflared-luna -n 15 --no-pager 2>/dev/null || true
fi
echo
echo "Próximo passo: no painel do túnel › Public Hostname › Add:"
echo "  luna.SEUDOMINIO › HTTP › 127.0.0.1:$(luna_port)"
