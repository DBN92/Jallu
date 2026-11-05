#!/usr/bin/env bash
# Instala o ffmpeg (conversor de vídeo) LOCALMENTE em runtime/ffmpeg/ — sem Docker e sem alterar o sistema.
# Usado pelas “câmeras diretas” (a Luna lê o RTSP da câmera e converte para H.264).
# Uso: sudo bash scripts/ffmpeg-setup.sh [--if-missing]
source "$(dirname "$0")/lib.sh"

DIR="$LUNA_ROOT/runtime/ffmpeg"
BIN="$DIR/ffmpeg"
if [ "${1:-}" = "--if-missing" ] && [ -x "$BIN" ]; then ok "ffmpeg já instalado ($BIN)"; exit 0; fi

case "$(uname -m)" in
  x86_64|amd64) NAME="ffmpeg-linux-x64.gz"; SHA="17c1ae10b52ac499180679fe6ba77e17642390c4eedb0f1e3b0ac045da55128f" ;;
  *) fail "Arquitetura $(uname -m) sem pacote pronto. Instale o ffmpeg do sistema ou defina FFMPEG_PATH no .env." ;;
esac
URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/$NAME"

use_node || fail "Node.js não encontrado (rode antes o install.sh)."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
info "Baixando ffmpeg 6.0 estático (~29 MB)…"
if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar -o "$TMP/ff.gz" "$URL" || fail "Falha ao baixar $URL"
else node -e "fetch(process.argv[1]).then(async r=>{if(!r.ok)process.exit(1);require('fs').writeFileSync(process.argv[2],Buffer.from(await r.arrayBuffer()))}).catch(()=>process.exit(1))" "$URL" "$TMP/ff.gz" || fail "Falha ao baixar $URL"; fi

# Confere a integridade do arquivo baixado
GOT="$(node -e "const c=require('crypto').createHash('sha256');c.update(require('fs').readFileSync(process.argv[1]));console.log(c.digest('hex'))" "$TMP/ff.gz")"
[ "$GOT" = "$SHA" ] || fail "Arquivo baixado não confere (sha256 $GOT). Nada foi instalado."

mkdir -p "$DIR"
node -e "const z=require('zlib'),fs=require('fs');fs.writeFileSync(process.argv[2],z.gunzipSync(fs.readFileSync(process.argv[1])))" "$TMP/ff.gz" "$TMP/ffmpeg"
chmod 755 "$TMP/ffmpeg"
"$TMP/ffmpeg" -hide_banner -version >/dev/null 2>&1 || fail "O ffmpeg baixado não executa neste sistema."
mv -f "$TMP/ffmpeg" "$BIN"
# Mesmo dono da pasta da Luna (o serviço só precisa executar)
OWNER="$(stat -c '%U:%G' "$LUNA_ROOT" 2>/dev/null || true)"; [ -n "$OWNER" ] && chown -R "$OWNER" "$DIR" 2>/dev/null || true
ok "ffmpeg instalado em $BIN ($("$BIN" -hide_banner -version | head -1 | cut -d' ' -f1-3))"
info "Agora, em Ajustes › Câmeras diretas, adicione a câmera e toque em “Testar conexão”."
