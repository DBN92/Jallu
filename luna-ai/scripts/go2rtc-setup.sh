#!/usr/bin/env bash
# Instala o go2rtc LOCALMENTE em runtime/go2rtc/ (sem Docker e sem alterar o sistema).
# A Luna usa só para trazer o vídeo WebRTC de câmeras Smart Life pela nuvem Tuya (ex.: babá eletrônica).
# Roda só quando há câmera Tuya aberta, ouvindo apenas em 127.0.0.1 (nenhuma porta para a rede).
# Uso: sudo bash scripts/go2rtc-setup.sh [--if-missing]
source "$(dirname "$0")/lib.sh"

DIR="$LUNA_ROOT/runtime/go2rtc"
BIN="$DIR/go2rtc"
VERSION="v1.9.15"
if [ "${1:-}" = "--if-missing" ] && [ -x "$BIN" ]; then ok "go2rtc já instalado ($DIR)"; exit 0; fi

case "$(uname -m)" in
  x86_64|amd64) FILE="go2rtc_linux_amd64"; SHA="20b46c6910734cb05ecefb234066f36868ff19b42ba1418a7a32e13a3e035712" ;;
  *) fail "Arquitetura $(uname -m) sem pacote conferido do go2rtc." ;;
esac
URL="https://github.com/AlexxIT/go2rtc/releases/download/$VERSION/$FILE"

use_node || fail "Node.js não encontrado (rode antes o install.sh)."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

info "Baixando o go2rtc $VERSION (~6 MB)…"
if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar -o "$TMP/go2rtc" "$URL" || fail "Falha ao baixar $URL"
else node -e "fetch(process.argv[1]).then(async r=>{if(!r.ok)process.exit(1);require('fs').writeFileSync(process.argv[2],Buffer.from(await r.arrayBuffer()))}).catch(()=>process.exit(1))" "$URL" "$TMP/go2rtc" || fail "Falha ao baixar $URL"; fi
GOT="$(node -e "const c=require('crypto').createHash('sha256');c.update(require('fs').readFileSync(process.argv[1]));console.log(c.digest('hex'))" "$TMP/go2rtc")"
[ "$GOT" = "$SHA" ] || fail "Arquivo baixado não confere (sha256 $GOT). Nada foi instalado."
chmod +x "$TMP/go2rtc"
"$TMP/go2rtc" -version >/dev/null 2>&1 || fail "O go2rtc baixado não executa neste sistema."

mkdir -p "$DIR"; mv "$TMP/go2rtc" "$BIN"
OWNER="$(stat -c '%U:%G' "$LUNA_ROOT" 2>/dev/null || true)"; [ -n "$OWNER" ] && chown -R "$OWNER" "$DIR" 2>/dev/null || true
ok "go2rtc $VERSION instalado em $DIR"
