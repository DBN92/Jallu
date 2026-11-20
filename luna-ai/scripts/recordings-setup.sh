#!/usr/bin/env bash
# Pasta das gravações das câmeras: cria e libera a escrita para o serviço da Luna (que só escreve na
# pasta de dados dela). Pasta: RECORDINGS_DIR do .env, ou /DATA/Gravacoes no ZimaOS.
source "$(dirname "$0")/lib.sh"
cd "$LUNA_ROOT"
DIR="$(env_get RECORDINGS_DIR)"
if [ -z "$DIR" ]; then
  if [ -d /DATA ]; then DIR=/DATA/Gravacoes; else DIR="$(data_dir)/gravacoes"; fi
fi
case "$DIR" in /*) ;; *) fail "RECORDINGS_DIR precisa ser um caminho completo (ex.: /DATA/Gravacoes)" ;; esac
as_root mkdir -p "$DIR"
if has_systemd_unit; then
  USR="$(systemctl show -p User --value "$LUNA_SERVICE" 2>/dev/null)"; USR="${USR:-root}"
  GRP="$(systemctl show -p Group --value "$LUNA_SERVICE" 2>/dev/null)"; GRP="${GRP:-$USR}"
  as_root chown "$USR:$GRP" "$DIR" 2>/dev/null || true
  DROP="/etc/systemd/system/${LUNA_SERVICE}.service.d"
  CONF="$DROP/gravacoes.conf"
  WANT="$(printf '[Service]\n# Gravação das câmeras (scripts/recordings-setup.sh)\nReadWritePaths=%s\n' "$DIR")"
  if [ "$(cat "$CONF" 2>/dev/null)" != "$WANT" ]; then
    as_root mkdir -p "$DROP"
    printf '%s\n' "$WANT" | as_root tee "$CONF" >/dev/null
    as_root systemctl daemon-reload
  fi
fi
ok "Gravações das câmeras em $DIR"
