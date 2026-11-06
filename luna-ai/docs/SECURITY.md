# Segurança

| Controle | Implementação |
|---|---|
| Autenticação | Usuário/senha (scrypt). Primeiro admin exige `LUNA_SETUP_CODE`. |
| Sessões | Token opaco aleatório (256 bits) em cookie `HttpOnly`, `SameSite=Strict`, `Secure` sob HTTPS; apenas o hash SHA-256 fica no banco; revogáveis (logout/troca de senha). |
| CSRF | *Double submit*: cookie `luna_csrf` + cabeçalho `X-CSRF-Token` obrigatório em métodos que alteram estado. |
| WebSocket | Autenticado pelo cookie de sessão e com verificação de `Origin`. |
| Rate limiting | Global 300/min; login 8 a cada 5 min; chat 30/min; voz 10–40/min. Por cliente real (`CF-Connecting-IP` do Cloudflare), sem exceção para 127.0.0.1. |
| Validação | Zod em todas as entradas; `entity_id` validado por regex. |
| Permissões | Papéis `admin`/`member`. Só admin altera autorizações de dispositivos, automações, usuários e vê logs. |
| Autorização da IA | Lista fechada de ferramentas; domínios controláveis fixos; cada dispositivo precisa estar autorizado para a IA; comandos coletivos só atingem dispositivos autorizados. |
| Prompt injection | Regras no prompt de sistema + o mais importante: **o backend valida toda ação** independentemente do que o modelo disser. Ferramentas desconhecidas são recusadas. |
| Sem shell | Não existe nenhum caminho de código que execute comandos sugeridos pela IA. |
| Segredos | Somente no `.env` do servidor (permissão 600). O navegador recebe apenas tokens efêmeros da OpenAI Realtime (10 min). Logs com `cookie`/`authorization` redigidos. |
| Cabeçalhos | Helmet com CSP restritiva (`script-src 'self'`), `Permissions-Policy` (microfone e GPS só na própria origem). |
| Privacidade | Coordenadas do GPS não são persistidas; são arredondadas (~1 km) para a consulta ao clima. Memórias só vão para a nuvem se o usuário permitir. Transcrição na nuvem desativada por padrão. Service worker não armazena respostas da API. |
| Memória | Só salva quando pedido explicitamente; recusa senhas, CPF e cartões. |
| Serviço Linux | Usuário dedicado sem privilégios, `ProtectSystem=strict`, `NoNewPrivileges`, sem capabilities. |
| Rede | Nenhuma porta precisa ser aberta no roteador; HA não é exposto; recomendação de Cloudflare Access. |

## Recomendações

- Use Cloudflare Access na frente da DIA.
- Crie um usuário no HA só para a DIA (admin apenas se for usar automações) e gere o token nele.
- Mantenha `LUNA_HOST=127.0.0.1` se o `cloudflared` roda no próprio host e você não precisa de acesso por IP local.
- Rode `bash scripts/update.sh` periodicamente.

## Observação de dependências

`npm audit` aponta um aviso no `deepmerge-ts` usado apenas pela CLI do Prisma 6 ao ler o próprio arquivo de configuração
(não é usado em tempo de execução nem processa dados externos). Será resolvido ao migrar para o Prisma 7.
