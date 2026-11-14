#!/usr/bin/env bash
# Instala a voz da Luna (Piper + voz feminina “Dii”, português do Brasil) LOCALMENTE em runtime/piper/,
# sem Docker e sem alterar o sistema. A fala é gerada no próprio servidor: grátis e sem internet.
# Uso: sudo bash scripts/piper-setup.sh [--if-missing]
source "$(dirname "$0")/lib.sh"

DIR="$LUNA_ROOT/runtime/piper"
BIN="$DIR/piper/piper"
MODEL="$DIR/dii_pt-BR.onnx"
if [ "${1:-}" = "--if-missing" ] && [ -x "$BIN" ] && [ -f "$MODEL" ] && [ -f "$MODEL.json" ]; then ok "Voz da Luna já instalada ($DIR)"; exit 0; fi

case "$(uname -m)" in
  x86_64|amd64) TAR="piper_linux_x86_64.tar.gz"; TAR_SHA="a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992" ;;
  *) fail "Arquitetura $(uname -m) sem pacote pronto do Piper." ;;
esac
PIPER_URL="https://github.com/rhasspy/piper/releases/download/2023.11.14-2/$TAR"
# Voz “Dii” (OpenVoiceOS, licença CC BY-NC-ND 4.0: uso pessoal, não comercial), versão fixa
HF="https://huggingface.co/OpenVoiceOS/pipertts_pt-BR_dii/resolve/38281189bdbc6a0346041925b56da6d71d6fba3d"
MODEL_SHA="fb15a447ba7482b922e1d2fefea71c1031f760e72be24cce7794e26fe11d086b"
JSON_SHA="306998295ac96a449d43a19c8aad65b31e040341e15decbdf4aa68d88670ec84"

use_node || fail "Node.js não encontrado (rode antes o install.sh)."
command -v tar >/dev/null 2>&1 || fail "O comando tar não existe neste sistema."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

download() { # url destino
  if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar -o "$2" "$1" || fail "Falha ao baixar $1"
  else node -e "fetch(process.argv[1]).then(async r=>{if(!r.ok)process.exit(1);require('fs').writeFileSync(process.argv[2],Buffer.from(await r.arrayBuffer()))}).catch(()=>process.exit(1))" "$1" "$2" || fail "Falha ao baixar $1"; fi
}
check() { # arquivo sha
  local got; got="$(node -e "const c=require('crypto').createHash('sha256');c.update(require('fs').readFileSync(process.argv[1]));console.log(c.digest('hex'))" "$1")"
  [ "$got" = "$2" ] || fail "Arquivo baixado não confere: $(basename "$1") (sha256 $got). Nada foi instalado."
}

info "Baixando o Piper (~26 MB)…"; download "$PIPER_URL" "$TMP/piper.tar.gz"; check "$TMP/piper.tar.gz" "$TAR_SHA"
info "Baixando a voz Dii (~64 MB)…"; download "$HF/dii_pt-BR.onnx" "$TMP/dii_pt-BR.onnx"; check "$TMP/dii_pt-BR.onnx" "$MODEL_SHA"
download "$HF/dii_pt-BR.onnx.json" "$TMP/dii_pt-BR.onnx.json"; check "$TMP/dii_pt-BR.onnx.json" "$JSON_SHA"

mkdir -p "$TMP/out"
tar -xzf "$TMP/piper.tar.gz" -C "$TMP/out"
# Teste antes de instalar: fala uma frase curta
echo "Olá, eu sou a Luna." | "$TMP/out/piper/piper" -m "$TMP/dii_pt-BR.onnx" -f "$TMP/teste.wav" >/dev/null 2>&1 || fail "O Piper baixado não executa neste sistema."
[ -s "$TMP/teste.wav" ] || fail "O Piper não gerou áudio no teste."

rm -rf "$DIR"; mkdir -p "$DIR"
mv "$TMP/out/piper" "$DIR/piper"
mv "$TMP/dii_pt-BR.onnx" "$TMP/dii_pt-BR.onnx.json" "$DIR/"
OWNER="$(stat -c '%U:%G' "$LUNA_ROOT" 2>/dev/null || true)"; [ -n "$OWNER" ] && chown -R "$OWNER" "$DIR" 2>/dev/null || true
ok "Voz da Luna instalada em $DIR (Piper + Dii)"
