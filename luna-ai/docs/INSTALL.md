# Guia de instalação e atualização (ZimaOS / Linux nativo, sem Docker)

## Requisitos

- Linux x86_64 ou ARM64 com `bash`, `curl` (ou `wget`), `tar`, `xz` e `git`.
- Home Assistant já instalado e acessível pela rede local (não é alterado).
- Opcional: Ollama (IA local) e chave da OpenAI (IA em nuvem e voz em tempo real).
- Node.js **não** precisa estar instalado: o instalador baixa o Node 22 LTS oficial (com verificação SHA-256)
  para `luna-ai/runtime/node`, sem tocar no sistema.

## 1. Diagnóstico (FASE 1) — somente leitura

```bash
# No ZimaOS, /DATA é a área persistente e gravável
git clone -b feat/luna-ai https://github.com/dbn92/jallu.git /DATA/AppData/luna-src
cd /DATA/AppData/luna-src/luna-ai
bash scripts/diagnose.sh
```

O diagnóstico mostra: sistema e arquitetura, CPU (AVX/AVX2 para o Ollama), RAM e disco, Node/npm,
portas 8787/8123/11434, onde o Home Assistant responde, se o Ollama e o modelo estão prontos,
como o Cloudflare Tunnel está rodando e quais diretórios são graváveis. **Nada é alterado.**

> Mantenha o projeto em `/DATA/AppData/...` (ou `/opt`). Se ficar em `/root`, o usuário dedicado `luna`
> não conseguirá lê-lo. Depois que o branch for mesclado, use `git clone https://github.com/dbn92/jallu.git`.

## 2. Instalação

```bash
sudo bash scripts/install.sh
```

O instalador:

1. Instala o Node localmente se necessário (`runtime/node`).
2. Cria `.env` a partir de `.env.example` **somente se não existir**, com `LUNA_SETUP_CODE` aleatório e o banco em
   `/DATA/AppData/luna-ai/luna.db` (ou `./data`). Permissão `600`.
3. Roda `npm ci`, compila API e PWA e aplica as migrações do SQLite.
4. Cria o usuário de sistema **`luna`** (sem shell, sem sudo) e dá a ele apenas a pasta de dados e o `.env`.
5. Instala o serviço **systemd** `luna-ai` (com endurecimento: `ProtectSystem=strict`, `NoNewPrivileges`, etc.)
   e o habilita no boot. Alternativas: `--service user` (systemd de usuário), `--service pm2` ou `--service none`.

Opções: `--data-dir DIR`, `--user NOME`, `--service ...`, `--yes`, `--skip-diagnose`.

## 3. Configuração

Edite o `.env` (veja todos os campos comentados em `.env.example`):

| Variável | Para quê |
|---|---|
| `HA_URL` | Endereço interno do HA, ex. `http://127.0.0.1:8123` ou `http://192.168.0.10:8123` |
| `HA_TOKEN` | HA › seu perfil › **Segurança** › *Tokens de acesso de longa duração* › Criar. Para criar automações, use um usuário **administrador** do HA. |
| `OLLAMA_URL` / `OLLAMA_MODEL` | IA local. Modelo com *tools*: `qwen2.5:3b` (recomendado no Mac mini 2012) ou `qwen2.5:1.5b` (mais rápido) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | IA em nuvem, voz em tempo real e transcrição. Opcional. |
| `LUNA_AI_MODE` | `local`, `cloud` ou `hybrid` (padrão; cada usuário pode trocar no app) |
| `LUNA_PUBLIC_URL` | `https://luna.seudominio.com` |
| `LUNA_AI_AUTO_AUTHORIZE_DOMAINS` | Domínios autorizados automaticamente para a IA ao serem descobertos (padrão: `light`) |

Depois: `bash scripts/stop.sh && bash scripts/start.sh` e `bash scripts/health-check.sh`.

### Ollama no Mac mini 2012

O processador (Ivy Bridge) tem AVX mas não AVX2: o Ollama funciona em CPU, porém mais devagar.
Com 16 GB de RAM, `qwen2.5:3b` responde em alguns segundos. A DIA resolve comandos frequentes
(“acenda a luz da sala”, “que horas são”, “vai chover?”) com um interpretador local determinístico,
**sem depender do LLM**, então o controle da casa continua rápido mesmo com o Ollama lento ou desligado.

Se a raiz do ZimaOS for somente leitura, instale o Ollama em `/DATA` conforme
[`infra/linux/ollama.service.example`](../infra/linux/ollama.service.example).

## 4. Primeiro acesso

1. Publique pelo Cloudflare: [CLOUDFLARE.md](CLOUDFLARE.md).
2. Abra `https://luna.seudominio.com` no Safari do iPhone.
3. Crie o administrador usando o `LUNA_SETUP_CODE` do `.env`.
4. **Minha casa › ⚙** — revise quais dispositivos a DIA pode controlar (luzes vêm autorizadas por padrão).
5. **Configurações** — escolha o modo de IA, a voz e defina a localização de casa (ou permita o GPS).
6. Safari › **Compartilhar › Adicionar à Tela de Início**.

## 5. Atualização

```bash
cd /DATA/AppData/luna-src/luna-ai
sudo bash scripts/update.sh
```

Faz backup do banco (`<dados>/backups`, mantém os 10 últimos), `git pull --ff-only`, build, migrações,
reinicia o serviço e roda o health-check. Se você copiou a pasta em vez de usar git, atualize os arquivos e rode
`sudo bash scripts/update.sh --no-pull`.

### Restaurar um backup

```bash
sudo bash scripts/stop.sh
cp <dados>/backups/luna-AAAAMMDD-HHMMSS.db <dados>/luna.db
sudo bash scripts/start.sh
```

## 6. Operação

| Ação | Comando |
|---|---|
| Status | `systemctl status luna-ai` |
| Logs | `journalctl -u luna-ai -f` |
| Iniciar / parar | `bash scripts/start.sh` / `bash scripts/stop.sh` |
| Saúde | `bash scripts/health-check.sh [--public]` |
| Desinstalar o serviço | `sudo systemctl disable --now luna-ai && sudo rm /etc/systemd/system/luna-ai.service && sudo systemctl daemon-reload` |

A DIA sobrevive a reinicializações do servidor pelo `systemctl enable` (ou `pm2 startup`).

## Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| “O Home Assistant não está configurado” | `HA_URL`/`HA_TOKEN` vazios no `.env` |
| “O token do Home Assistant é inválido” | Gere um novo token de longa duração |
| Microfone/GPS não funcionam | Acesso por `http://` — use o domínio HTTPS do Cloudflare |
| Microfone não reconhece fala no app instalado (iPhone) | Limitação do iOS em PWAs: ative **Transcrição na nuvem** ou **Voz em tempo real** em Configurações |
| “Modelo não instalado” | `ollama pull <modelo>` |
| Automação fica em “Erro” | O token do HA precisa ser de administrador e o `configuration.yaml` precisa ter `automation: !include automations.yaml` (padrão) |
| Porta 8787 ocupada | Altere `LUNA_PORT` e o hostname no Cloudflare |
