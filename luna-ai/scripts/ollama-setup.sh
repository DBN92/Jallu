#!/usr/bin/env bash
# Instala o Ollama (IA local, gratuita) NATIVAMENTE em /DATA — sem Docker — como serviço systemd,
# baixa o modelo e configura a Luna para usá-lo. Uso: sudo bash scripts/ollama-setup.sh [--model qwen2.5:3b]
#
# Modelos sugeridos para CPU sem AVX2 (ex.: Mac mini 2012, 16 GB):
#   qwen2.5:3b   — equilíbrio (padrão), bom com ferramentas
#   qwen3:4b     — mais esperto, um pouco mais lento (a Luna desliga o “pensamento” para ganhar velocidade)
#   qwen2.5:1.5b — o mais rápido, menos esperto
# Para trocar depois, rode de novo com --model (o Ollama já instalado é reaproveitado).
source "$(dirname "$0")/lib.sh"
[ "$(id -u)" -eq 0 ] || fail "Rode com sudo: sudo bash scripts/ollama-setup.sh"

MODEL="qwen2.5:3b"
while [ $# -gt 0 ]; do case "$1" in --model) MODEL="$2"; shift 2 ;; *) fail "Opção desconhecida: $1" ;; esac; done
DIR="${OLLAMA_DIR:-/DATA/AppData/ollama}"
UNIT=/etc/systemd/system/ollama.service
case "$(uname -m)" in x86_64|amd64) ARCH=amd64 ;; aarch64|arm64) ARCH=arm64 ;; *) fail "Arquitetura não suportada";; esac

if systemctl list-unit-files ollama.service 2>/dev/null | grep -q ollama && ! grep -q "$DIR" "$UNIT" 2>/dev/null; then
  fail "Já existe um serviço 'ollama' que não foi criado por este script. Nada foi alterado."
fi

mkdir -p "$DIR/models"
if [ ! -x "$DIR/bin/ollama" ]; then
  info "Baixando Ollama ($ARCH) para $DIR (pode levar alguns minutos)…"
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  # O Ollama publica apenas .tar.zst. Descompacta com zstd se existir; senão, com o Node da Luna.
  URL="https://ollama.com/download/ollama-linux-$ARCH.tar.zst"
  curl -fL --progress-bar -o "$TMP/ollama.tar.zst" "$URL" \
    || curl -fL --progress-bar -o "$TMP/ollama.tar.zst" "https://github.com/ollama/ollama/releases/latest/download/ollama-linux-$ARCH.tar.zst" \
    || fail "Não consegui baixar o Ollama. Verifique a internet."
  info "Descompactando…"
  if command -v zstd >/dev/null 2>&1; then
    zstd -dc "$TMP/ollama.tar.zst" | tar -x -C "$DIR"
  else
    use_node || fail "Node não encontrado para descompactar (rode scripts/install.sh antes)."
    node -e "const z=require('zlib'),fs=require('fs');if(!z.createZstdDecompress){console.error('Node sem suporte a zstd');process.exit(1)}fs.createReadStream(process.argv[1]).pipe(z.createZstdDecompress()).pipe(process.stdout)" "$TMP/ollama.tar.zst" | tar -x -C "$DIR"
  fi
fi
"$DIR/bin/ollama" --version >/dev/null 2>&1 || fail "O binário do Ollama não executou neste sistema."
ok "Ollama instalado em $DIR"

# Usuário dedicado sem privilégios
if ! id ollama >/dev/null 2>&1; then
  useradd --system --home-dir "$DIR" --no-create-home --shell /usr/sbin/nologin ollama 2>/dev/null || useradd -r -d "$DIR" -s /bin/false ollama
fi
chown -R ollama:"$(id -gn ollama)" "$DIR"

cat > "$UNIT" <<UNITEOF
[Unit]
Description=Ollama (IA local da Luna)
After=network-online.target

[Service]
User=ollama
Group=$(id -gn ollama)
ExecStart=$DIR/bin/ollama serve
Environment=HOME=$DIR
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_MODELS=$DIR/models
# Mantém o modelo SEMPRE carregado na memória (recarregar custa dezenas de segundos em CPU)
Environment=OLLAMA_KEEP_ALIVE=-1
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
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
systemctl enable ollama >/dev/null 2>&1 || true
systemctl restart ollama  # aplica as configurações novas mesmo se já estava rodando
for i in $(seq 1 20); do http_get http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 1; done
http_get http://127.0.0.1:11434/api/tags >/dev/null 2>&1 || fail "O Ollama não respondeu. Veja: journalctl -u ollama -n 30"
ok "Serviço 'ollama' ativo"

info "Baixando o modelo $MODEL (≈2 GB para 3b)…"
OLLAMA_HOST=127.0.0.1:11434 "$DIR/bin/ollama" pull "$MODEL"

info "Aquecendo o modelo (primeira carga é a mais lenta)…"
start=$(date +%s)
OLLAMA_HOST=127.0.0.1:11434 "$DIR/bin/ollama" run "$MODEL" "Responda apenas: ok" >/dev/null 2>&1 || true
ok "Modelo pronto ($(( $(date +%s) - start ))s na primeira carga)"

cd "$LUNA_ROOT"
env_set OLLAMA_URL "http://127.0.0.1:11434"
env_set OLLAMA_MODEL "$MODEL"
env_set OLLAMA_KEEP_ALIVE "-1"
ok "Luna configurada para usar $MODEL"
bash scripts/stop.sh >/dev/null 2>&1 || true
bash scripts/start.sh
echo
echo "Para conversa 100% gratuita, no app: Ajustes › Inteligência artificial: Local  e  Modo de voz: Básico."
