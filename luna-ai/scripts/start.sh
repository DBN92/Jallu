#!/usr/bin/env bash
# Inicia a Luna (systemd, PM2 ou processo em segundo plano).
source "$(dirname "$0")/lib.sh"
cd "$LUNA_ROOT"
if has_systemd_unit; then
  as_root systemctl start "$LUNA_SERVICE"; ok "Serviço systemd iniciado"
elif has_user_unit; then
  systemctl --user start "$LUNA_SERVICE"; ok "Serviço systemd (usuário) iniciado"
elif has_pm2_app || command -v pm2 >/dev/null 2>&1; then
  use_node || true
  LUNA_NODE="${NODE_BIN:-node}" pm2 start infra/linux/ecosystem.config.cjs --update-env >/dev/null && ok "Iniciado via PM2"
else
  use_node || fail "Node.js não encontrado."
  RUN_DIR="$(data_dir)/run"; mkdir -p "$RUN_DIR"
  if [ -f "$RUN_DIR/luna.pid" ] && kill -0 "$(cat "$RUN_DIR/luna.pid")" 2>/dev/null; then ok "A Luna já está em execução (PID $(cat "$RUN_DIR/luna.pid"))"; exit 0; fi
  NODE_ENV=production LUNA_ENV_FILE="$LUNA_ROOT/.env" nohup "$NODE_BIN" apps/api/dist/server.js >> "$RUN_DIR/luna.log" 2>&1 &
  echo $! > "$RUN_DIR/luna.pid"
  warn "Iniciado sem gerenciador (não sobrevive a reinicializações). Log: $RUN_DIR/luna.log"
fi
sleep 2
"$(dirname "$0")/health-check.sh" || true
