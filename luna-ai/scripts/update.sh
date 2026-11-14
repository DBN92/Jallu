#!/usr/bin/env bash
# Atualiza a Luna com backup do banco, build, migração e reinício. Uso: bash scripts/update.sh [--no-pull]
source "$(dirname "$0")/lib.sh"
cd "$LUNA_ROOT"
use_node || fail "Node.js não encontrado."

DATA="$(data_dir)"; DB="$DATA/luna.db"
if [ -f "$DB" ]; then
  mkdir -p "$DATA/backups"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  # Backup consistente: usa a API de backup do SQLite se disponível
  if command -v sqlite3 >/dev/null 2>&1; then sqlite3 "$DB" ".backup '$DATA/backups/luna-$STAMP.db'"; else cp "$DB" "$DATA/backups/luna-$STAMP.db"; fi
  # Mantém os 10 backups mais recentes (sem xargs, que não existe no ZimaOS)
  ls -1t "$DATA/backups"/luna-*.db 2>/dev/null | tail -n +11 | while IFS= read -r old; do rm -f "$old"; done || true
  ok "Backup do banco: $DATA/backups/luna-$STAMP.db"
fi

if [ "${1:-}" != "--no-pull" ] && git -C "$LUNA_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  info "Baixando atualizações (git pull --ff-only)…"
  git -C "$LUNA_ROOT" pull --ff-only || fail "git pull falhou (alterações locais?). Nada foi modificado."
fi

bash scripts/build.sh
# Conversor de vídeo das câmeras diretas (só baixa se ainda não existir; falha aqui não impede a atualização)
bash scripts/ffmpeg-setup.sh --if-missing || warn "ffmpeg não instalado — câmeras diretas indisponíveis (rode: sudo bash scripts/ffmpeg-setup.sh)"
# Voz da Luna (Piper + Dii), gerada no próprio servidor
bash scripts/piper-setup.sh --if-missing || warn "Voz da Luna não instalada — usando a voz do aparelho (rode: sudo bash scripts/piper-setup.sh)"
node apps/api/scripts/migrate.mjs
if has_systemd_unit; then as_root systemctl restart "$LUNA_SERVICE"
elif has_user_unit; then systemctl --user restart "$LUNA_SERVICE"
elif has_pm2_app; then pm2 restart "$LUNA_SERVICE" --update-env >/dev/null
else bash scripts/stop.sh || true; bash scripts/start.sh; exit 0; fi
sleep 3
bash scripts/health-check.sh
ok "Atualização concluída"
