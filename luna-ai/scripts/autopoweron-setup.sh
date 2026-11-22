#!/usr/bin/env bash
# Mac mini (Intel) com Linux/ZimaOS: liga sozinho quando a energia volta, e confere se o app do túnel
# (cloudflared, app do ZimaOS) reinicia junto. Uso: sudo bash scripts/autopoweron-setup.sh
#
# No macOS isso é a opção “Ligar automaticamente após falta de energia”. No Linux é um bit do chip do
# Mac (registro 0xA4 da ponte LPC Intel, dispositivo 00:1f.0) que precisa ser gravado a cada inicialização:
# por isso vira um serviço que roda no boot.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash scripts/autopoweron-setup.sh"; exit 1; }

DEV=/sys/bus/pci/devices/0000:00:1f.0
if [ ! -e "$DEV/config" ]; then echo "✗ Não achei o chip 00:1f.0 (não parece um Mac Intel). Nada foi alterado."; exit 1; fi
VENDOR="$(cat "$DEV/vendor")"; CLASS="$(cat "$DEV/class")"
if [ "$VENDOR" != "0x8086" ] || [ "${CLASS:0:6}" != "0x0601" ]; then echo "✗ O chip 00:1f.0 não é a ponte LPC Intel ($VENDOR $CLASS). Nada foi alterado."; exit 1; fi

UNIT=/etc/systemd/system/luna-autopoweron.service
cat > "$UNIT" <<UNITEOF
[Unit]
Description=Liga o Mac mini sozinho quando a energia volta (registro 0xA4 do chip Intel)
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'printf "\\\\000" | dd of=$DEV/config bs=1 seek=164 count=1 conv=notrunc status=none'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable --now luna-autopoweron >/dev/null
BYTE="$(dd if="$DEV/config" bs=1 skip=164 count=1 status=none | od -An -tx1 | tr -d ' ')"
if [ "$BYTE" = "00" ]; then echo "✓ Ligar sozinho após falta de energia: ativado (vale a partir de agora e a cada inicialização)"; else echo "! Gravei, mas o registro ficou em $BYTE (esperado 00)."; fi

# Túnel como app do ZimaOS (contêiner): precisa reiniciar sozinho com o servidor
if command -v docker >/dev/null 2>&1; then
  found=0
  while read -r name image; do
    [ -n "$name" ] || continue
    found=1
    pol="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$name")"
    if [ "$pol" = "always" ] || [ "$pol" = "unless-stopped" ]; then
      echo "✓ Túnel ($name): já reinicia sozinho ($pol)"
    else
      docker update --restart unless-stopped "$name" >/dev/null && echo "✓ Túnel ($name): agora reinicia sozinho (antes: ${pol:-nenhum})"
    fi
    st="$(docker inspect -f '{{.State.Status}}' "$name")"
    [ "$st" = "running" ] || { docker start "$name" >/dev/null && echo "✓ Túnel ($name) estava $st: iniciado"; }
  done < <(docker ps -a --format '{{.Names}} {{.Image}}' | grep -i cloudflare || true)
  [ "$found" = 1 ] || echo "! Não achei o app do cloudflared no ZimaOS."
fi
systemctl is-enabled luna-ai >/dev/null 2>&1 && echo "✓ Luna: inicia sozinha com o servidor"
