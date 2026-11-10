# Siri e app Atalhos

Fale com a DIA pela Siri, inclusive com o iPhone bloqueado:

1. Diga **"E aí Siri, DIA"**.
2. A Siri abre o ditado. Fale o comando, por exemplo "acende a luz da sala", "aspira a casa" ou "o portão está fechado?".
3. A Siri fala a resposta da DIA.

Funciona com tudo o que a DIA entende por voz: luzes, tomadas, aspiradores, garagem, clima, memória e conversa com a IA.
Se a DIA perguntar algo (por exemplo, "qual luz?"), chame a Siri de novo em até 3 minutos e responda: a conversa continua de onde parou.

## Como funciona (e por que é seguro)

- O atalho usa um **token próprio**, criado em **Configurações → Siri e Atalhos**. Ele não é a sua senha.
- O token **só** serve para mandar comandos à DIA (`POST /api/siri/ask`). Ele não abre câmeras, ajustes nem outras partes da API.
- O token aparece **uma vez**. No servidor fica apenas o hash dele.
- Cada token mostra quando foi usado pela última vez e pode ser apagado a qualquer momento. Apagar o token desativa o atalho na hora.
- Os comandos seguem as mesmas regras da voz: só controlam aparelhos com **"DIA pode controlar"** ativado. Há limite de 30 pedidos por minuto.

## Montar o atalho

Em **Configurações → Siri e Atalhos**, crie o token. A tela mostra o endereço e o token para copiar, e um botão **Testar o token**.
Depois, no app **Atalhos** do iPhone:

1. Toque em **+** e dê o nome **DIA** ao atalho. É esse nome que você fala para a Siri.
2. Adicione **Ditar Texto**: idioma **Português (Brasil)**, parar de ouvir **Após Pausa**.
3. Adicione **Obter Conteúdo do URL**:
   - **URL:** o endereço copiado, terminado em `/api/siri/ask`;
   - **Método:** POST;
   - **Cabeçalhos:** `Authorization` = `Bearer dia_…`, o token copiado;
   - **Corpo da Solicitação:** JSON, com o campo de texto `texto` = variável **Texto Ditado**.
4. Adicione **Falar Texto** com **Conteúdo do URL**.

**Atalhos de um comando só:** duplique o atalho e troque "Ditar Texto" por uma ação **Texto** com a frase, por exemplo "boa noite". Dê ao atalho um nome como "Boa noite DIA".

## Fora de casa

Para funcionar fora de casa, o endereço do atalho precisa ser o **público, em https** (pelo Cloudflare Tunnel).
Crie o token abrindo a DIA por esse endereço: a tela já mostra a URL certa.

Se a DIA estiver protegida pelo **Cloudflare Access**, o app Atalhos não consegue fazer o login do Access. Libere só esse caminho:

1. Zero Trust → Access → Applications → **Add application → Self-hosted**.
2. Domínio da DIA e caminho `api/siri/ask`.
3. Política: **Bypass**, Include: **Everyone**.

O caminho continua protegido pelo token da DIA e pelo limite de pedidos. Também dá para usar um *Service Token* do Access no lugar do Bypass. Para isso, adicione ao atalho os cabeçalhos `CF-Access-Client-Id` e `CF-Access-Client-Secret`.

## Problemas comuns

- **A Siri diz "Token da DIA ausente ou inválido":** confira o cabeçalho `Authorization`. O valor precisa começar com `Bearer ` (com espaço).
- **A Siri diz que o token foi apagado:** crie outro em Configurações e troque no atalho.
- **Demora para responder:** comandos de casa respondem na hora. Perguntas livres dependem da IA. A IA local no servidor pode levar alguns segundos.
