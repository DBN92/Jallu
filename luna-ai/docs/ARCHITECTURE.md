# Arquitetura

```
 iPhone (PWA, Safari)                       Mac mini · ZimaOS (Linux nativo, systemd)
 ┌──────────────────────┐   HTTPS/WSS   ┌──────────────────────────────────────────────────────┐
 │ React + Vite + TW    │──Cloudflare──▶│ luna-ai (Node 22, Fastify) :8787                      │
 │ • Web Speech (voz)   │    Tunnel     │  ├─ /api/*  REST (Zod)        ├─ /ws  eventos         │
 │ • SpeechSynthesis    │               │  ├─ auth (sessões + CSRF)     ├─ PWA estático         │
 │ • Geolocalização     │               │  ├─ ChatService ─┬─ NLU local (comandos frequentes)   │
 │ • WebRTC ────────────┼──────┐        │  │               ├─ AI Router ─┬─ OllamaProvider ──▶ Ollama :11434
 └──────────────────────┘      │        │  │               │             └─ OpenAIProvider ──▶ api.openai.com
                               │        │  │               └─ ToolExecutor (lista fechada + autorização)
                               │        │  ├─ DevicesService ─▶ HA REST /api/states, /api/services
                               │        │  ├─ HA WebSocket (state_changed) ─▶ hub /ws ─▶ PWA
                               │        │  ├─ AutomationsService ─▶ HA /api/config/automation/config
                               │        │  ├─ WeatherService (cache) ─▶ Open-Meteo
                               │        │  └─ Prisma ─▶ SQLite (/DATA/AppData/luna-ai/luna.db)
                               │        └──────────────────────────────────────────────────────┘
                               └──▶ OpenAI Realtime (token efêmero emitido pelo backend)
```

## Fluxo de um comando (“Oi, Luna, acenda a luz da sala”)

1. PWA envia `POST /api/chat` (texto ou transcrição de voz).
2. `ChatService` tenta a **NLU local** (`modules/ai/nlu.ts`): reconhece verbo + alvo.
3. `DevicesService.findByName` compara o alvo com **entidades reais** do HA (nome, apelidos, entity_id).
   - Nenhuma → “não encontrei”. Mais de uma → pergunta qual e guarda a pendência da conversa.
4. Autorização: domínio na lista fechada (`light`, `switch`, `fan`, `input_boolean`, `climate`) **e**
   dispositivo marcado como “Luna pode controlar”.
5. `POST /api/services/light/turn_on` no HA, depois lê o estado real para confirmar.
6. Grava em `action_logs`, emite `device_state` no WebSocket e responde “Pronto! A luz da Sala está acesa.”

Pedidos livres seguem para o **AI Router** → LLM com *function calling*. O LLM só pode chamar as
ferramentas de `modules/ai/tools.ts`; o `ToolExecutor` revalida tudo (o modelo nunca recebe acesso a shell, arquivos ou serviços arbitrários do HA).

## Roteamento de IA

| Modo | Ordem |
|---|---|
| `local` | Ollama (nunca nuvem) |
| `cloud` | OpenAI → Ollama |
| `hybrid` | mensagens complexas (planejar, organizar, escrever, explicar, criar automação…) → OpenAI → Ollama; casa/conversa simples → Ollama → OpenAI |

Se ações já foram executadas e o provedor falha no meio, **não** há nova tentativa em outro provedor (evita ação duplicada).

## Banco de dados (Prisma + SQLite)

`users`, `sessions`, `conversations`, `messages`, `memories`, `devices` (autorização e apelidos),
`integrations`, `action_logs`, `preferences` (configurações por usuário), `automation_rules`.

## Adicionando uma habilidade

1. Defina a ferramenta em `TOOL_DEFINITIONS` (`modules/ai/tools.ts`) com JSON Schema.
2. Implemente o `case` no `ToolExecutor.run` validando argumentos e permissões.
3. (Opcional) Adicione um padrão determinístico em `nlu.ts` para comandos frequentes.
4. Escreva testes em `apps/api/tests`.

A voz em tempo real usa automaticamente as mesmas ferramentas.
