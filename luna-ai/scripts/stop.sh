#!/usr/bin/env bash
# Para somente a Luna. Não toca no Home Assistant nem em outros serviços.
source "$(dirname "$0")/lib.sh"
if has_systemd_unit; then as_root systemctl stop "$LUNA_SERVICE"; ok "Serviço parado"
elif has_user_unit; then systemctl --user stop "$LUNA_SERVICE"; ok "Serviço (usuário) parado"
elif has_pm2_app; then pm2 stop "$LUNA_SERVICE" >/dev/null; ok "Parado no PM2"
else
  PID_FILE="$(data_dir)/run/luna.pid"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then kill "$(cat "$PID_FILE")"; rm -f "$PID_FILE"; ok "Processo encerrado"
  else warn "A Luna não parece estar em execução."; fi
fi
