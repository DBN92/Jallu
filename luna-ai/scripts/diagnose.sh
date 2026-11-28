#!/usr/bin/env bash
# FASE 1 — Diagnóstico do ambiente (somente leitura: não instala, não altera e não reinicia nada).
# Uso: bash scripts/diagnose.sh
source "$(dirname "$0")/lib.sh"
set +e

section() { printf '\n%s== %s ==%s\n' "$C_B" "$1" "$C_0"; }
port_in_use() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then ss -ltnH "( sport = :$p )" 2>/dev/null | grep -q . && return 0
  elif command -v netstat >/dev/null 2>&1; then netstat -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p$" && return 0
  else awk -v p="$(printf '%04X' "$p")" 'NR>1 && $4=="0A" {split($2,a,":"); if (a[2]==p) f=1} END {exit !f}' /proc/net/tcp /proc/net/tcp6 2>/dev/null && return 0; fi
  return 1
}

section "Sistema operacional"
[ -f /etc/os-release ] && grep -E '^(PRETTY_NAME|ID|VERSION_ID)=' /etc/os-release
echo "Kernel: $(uname -r)"
echo "Arquitetura: $(uname -m)"
[ -d /DATA ] && echo "ZimaOS/CasaOS: diretório /DATA encontrado"
command -v zimaos >/dev/null 2>&1 && echo "ZimaOS CLI presente"
echo "Usuário atual: $(id -un) (uid $(id -u))"

section "CPU e memória"
grep -m1 'model name' /proc/cpuinfo 2>/dev/null
echo "Núcleos: $(nproc 2>/dev/null)"
flags="$(grep -m1 '^flags' /proc/cpuinfo 2>/dev/null)"
for f in avx avx2 avx512f; do echo "$flags" | grep -qw "$f" && echo "  instrução $f: sim" || echo "  instrução $f: não"; done
echo "  (Ollama roda melhor com AVX2; sem AVX2 prefira modelos pequenos como qwen2.5:1.5b ou 3b)"
free -h 2>/dev/null || grep -E 'MemTotal|MemAvailable' /proc/meminfo

section "Armazenamento"
df -h "$LUNA_ROOT" 2>/dev/null | tail -n +1
[ -d /DATA ] && df -h /DATA | tail -n 1
for d in /etc/systemd/system /usr/local /opt /DATA "$HOME"; do
  [ -e "$d" ] || continue
  if [ -w "$d" ]; then echo "Gravável: $d"; else echo "Somente leitura (para $(id -un)): $d"; fi
done
mount 2>/dev/null | grep -E ' on / ' | grep -q '\bro\b' && warn "A raiz do sistema está montada como somente leitura (comum no ZimaOS). Use /DATA."

section "Node.js / npm / gerenciadores"
use_node >/dev/null 2>&1
if command -v node >/dev/null 2>&1; then
  echo "node: $(node -v) em $(command -v node)"
  node_version_ok && ok "Versão do Node compatível (>= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR})" || warn "Node antigo — o install.sh instalará o Node ${NODE_INSTALL_VERSION} em $LUNA_ROOT/runtime"
else
  warn "Node.js não encontrado — o install.sh instalará o Node ${NODE_INSTALL_VERSION} localmente (sem alterar o sistema)"
fi
command -v npm >/dev/null 2>&1 && echo "npm: $(npm -v)"
command -v pm2 >/dev/null 2>&1 && echo "pm2: $(pm2 -v 2>/dev/null | tail -n1)" || echo "pm2: não instalado"
command -v systemctl >/dev/null 2>&1 && echo "systemd: $(systemctl --version | head -n1)" || echo "systemd: não disponível"
command -v git >/dev/null 2>&1 && echo "git: $(git --version)"
for t in curl wget tar xz; do command -v "$t" >/dev/null 2>&1 && echo "$t: ok" || echo "$t: ausente"; done
libssl="$(ls /usr/lib*/libssl.so.* /lib*/libssl.so.* /usr/lib/*/libssl.so.* 2>/dev/null | head -n1)"
[ -n "$libssl" ] && echo "libssl (usada pelo Prisma): $libssl" || warn "libssl não encontrada — o banco (Prisma) pode não iniciar"
echo "Limite de arquivos abertos: $(ulimit -n) (máx. $(ulimit -Hn))"

section "Portas"
PORT="$(luna_port)"
for p in "$PORT" 8123 11434; do
  if port_in_use "$p"; then echo "Porta $p: EM USO"; else echo "Porta $p: livre"; fi
done
port_in_use "$PORT" && warn "A porta $PORT da Luna está ocupada. Defina outra em LUNA_PORT no .env."

section "Home Assistant"
HA="$(env_get HA_URL)"; HA="${HA:-http://127.0.0.1:8123}"
code="$(http_status "$HA/api/")"
case "$code" in
  401) ok "Home Assistant responde em $HA (exige token — esperado)";;
  200) ok "Home Assistant responde em $HA";;
  000) warn "Nada respondeu em $HA. Descubra o IP/porta do HA no painel do ZimaOS e ajuste HA_URL.";;
  *) warn "Resposta inesperada ($code) em $HA";;
esac
for cand in http://127.0.0.1:8123 http://localhost:8123 http://homeassistant.local:8123; do
  [ "$cand" = "$HA" ] && continue
  c="$(http_status "$cand/api/")"; if [ "$c" = "401" ] || [ "$c" = "200" ]; then echo "  também responde: $cand"; fi
done
TOKEN="$(env_get HA_TOKEN)"
if [ -n "$TOKEN" ] && command -v curl >/dev/null 2>&1; then
  c="$(curl -s -o /dev/null -m 5 -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$HA/api/")"
  [ "$c" = "200" ] && ok "Token do HA válido" || warn "Token do HA rejeitado (HTTP $c)"
fi

section "Ollama"
OL="$(env_get OLLAMA_URL)"; OL="${OL:-http://127.0.0.1:11434}"
command -v ollama >/dev/null 2>&1 && echo "Binário: $(command -v ollama) ($(ollama -v 2>/dev/null | tail -n1))" || echo "Binário ollama: não encontrado no PATH"
if tags="$(http_get "$OL/api/tags" 2>/dev/null)"; then
  ok "Ollama responde em $OL"
  echo "$tags" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log("Modelos: "+((j.models||[]).map(m=>m.name).join(", ")||"nenhum"))}catch{}})' 2>/dev/null
  M="$(env_get OLLAMA_MODEL)"; M="${M:-qwen2.5:3b}"
  echo "$tags" | grep -q "\"$M" && ok "Modelo configurado ($M) instalado" || warn "Modelo $M não instalado: execute 'ollama pull $M'"
else
  warn "Ollama não respondeu em $OL (a Luna funcionará com OpenAI e comandos locais)"
fi

section "Cloudflare Tunnel"
if pgrep -a cloudflared >/dev/null 2>&1; then
  ok "Processo cloudflared em execução:"; pgrep -a cloudflared | sed 's/--token [^ ]*/--token ***/; s/ eyJ[A-Za-z0-9._-]*/ ***/'
else
  echo "Nenhum processo cloudflared visível neste namespace (pode estar em um app do ZimaOS)."
fi
for f in /etc/cloudflared/config.yml /etc/cloudflared/config.yaml "$HOME/.cloudflared/config.yml" /DATA/AppData/cloudflared/config.yml; do
  [ -f "$f" ] && echo "Configuração encontrada: $f (ingress atual abaixo)" && grep -E 'hostname|service' "$f" | sed 's/^/    /'
done
if command -v docker >/dev/null 2>&1; then
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null | grep -i -E 'cloudflare|tunnel' | sed 's/^/  app (container existente, somente leitura): /'
fi
echo "Dica: se o túnel roda como app/contêiner, aponte o hostname para http://<IP-do-servidor>:$PORT (não 127.0.0.1)."
ip -4 addr show 2>/dev/null | awk '/inet / && $2 !~ /^127/ {print "  IP local: "$2}'

section "Luna AI"
echo "Diretório do projeto: $LUNA_ROOT"
[ -f "$LUNA_ROOT/.env" ] && ok ".env existe" || echo ".env ainda não criado (o install.sh cria a partir do .env.example)"
has_systemd_unit && echo "Serviço systemd: instalado ($(systemctl is-active $LUNA_SERVICE 2>/dev/null))"
has_user_unit && echo "Serviço systemd de usuário: instalado"
has_pm2_app && echo "PM2: app $LUNA_SERVICE registrado"
echo
ok "Diagnóstico concluído. Nenhuma alteração foi feita."
