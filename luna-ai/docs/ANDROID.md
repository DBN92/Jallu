# Android como assistente sempre ligada (“Oi, Dia”)

> **Tablet na tomada? Use o app DIA (recomendado).** A seção abaixo explica o app.
> O modo pelo navegador Chrome, mais adiante, continua funcionando para celulares.

## App DIA para Android (tablet)

O app abre as mesmas telas da DIA, que se atualizam sozinhas junto com o servidor. Ele também faz o que o navegador não consegue:

- **"Oi, Dia" com a tela desligada** e sem gritar:
  - a escuta é **off-line, no próprio tablet** (Vosk, modelo em português de 32 MB, baixado uma única vez);
  - um **ganho automático** ajuda quem fala baixo ou longe;
  - nenhum áudio sai do tablet antes do chamado.
- Depois do chamado, um sinal sonoro avisa. O pedido é reconhecido pelo Android, enviado para a DIA (mesmo caminho seguro da Siri, com um token só do tablet), e a resposta é falada pela voz do Android. Com a DIA aberta, aparece também a tela de voz com a nuvem.
- **Abre sozinho** quando o tablet liga e mantém a **tela acesa**.
- Botão **"Falar com a DIA"** na cortina de atalhos. O app também pode ser escolhido como **assistente** do aparelho.

**Instalar:**
1. No tablet, abra a DIA no navegador e vá em **Configurações → App Android (tablet) → Baixar o app DIA**.
2. Abra o arquivo baixado e permita "instalar apps desta fonte" quando o Android pedir.
3. No app, informe o endereço da DIA (o mesmo do navegador, ex.: `http://192.168.15.6:PORTA`) e entre com seu usuário.
4. Em **Configurações → App Android (tablet)**:
   - ligue o **"Oi, Dia" com a tela desligada**: na primeira vez ele baixa o modelo de voz;
   - toque em **Permitir** para "Aparecer sobre outros apps", necessário para abrir sozinho ao ligar;
   - toque em **Liberar** para o uso em segundo plano, porque a Samsung costuma fechar apps para economizar bateria.

Enquanto escuta, o Android mostra o aviso fixo **"DIA — Ouvindo 'Oi, Dia'"**, com o botão **Pausar**.

**Sensibilidade:**
- **Normal:** o padrão.
- **Alta:** ouve de mais longe, mas pode acordar por engano.
- **Baixa:** só acorda com a frase bem clara.

No teste com vozes sintéticas e ruído de fundo, a escuta acertou cerca de 90% dos "Oi, Dia" com fala normal ou baixa e 75% com fala bem baixa. Só 1 em 144 frases comuns acordou a DIA por engano.

**Atualizar:** quando o servidor tiver uma versão nova, a seção mostra **Atualizar**. O app baixa o APK, e tocar no aviso abre o instalador.

**Para quem mantém o código:** o app fica em `apps/android`. O APK pronto fica em `apps/android/dist/dia.apk` e é servido pela própria DIA.
Para gerar uma versão nova, use `scripts/android-build.sh`. O script precisa do SDK do Android e da **chave de assinatura, que fica fora do repositório** (variáveis `DIA_KEYSTORE` e `DIA_KEYSTORE_PASSWORD`). Use sempre a mesma chave, senão a versão nova não instala por cima.

---

## Pelo navegador (celulares)

## Como funciona

| Etapa | Onde roda | Custo |
|---|---|---|
| Escutar a palavra “DIA” continuamente | Reconhecimento de fala do **Chrome** (Android) | Gratuito |
| Conversa depois do chamado | OpenAI Realtime (voz em tempo real) **ou** modo básico | Só durante a conversa |
| Encerrar a conversa | Automático após **30 s** sem fala | — |

A sessão da OpenAI **não** fica aberta o tempo todo: ela abre ao ouvir “DIA” (com um sinal sonoro) e fecha sozinha.
Você pode falar tudo de uma vez — “Oi Dia, acende a luz da sala” — ou só “Oi Dia” e esperar o sinal.

> Privacidade: enquanto espera o chamado, o áudio é processado pelo serviço de reconhecimento de fala do Google (é assim que o Chrome funciona). A DIA só envia o que vem **depois** de “DIA”.

## Preparar o aparelho

1. Use o **Google Chrome** (não o navegador da Samsung, nem apps “kiosk” baseados em WebView — eles não têm reconhecimento de fala).
2. Abra `https://luna.seudominio.com`, entre e toque em **⋮ › Instalar app** (ou “Adicionar à tela inicial”).
3. Abra a DIA pelo ícone e permita **microfone** e **localização**.
4. **Ajustes**:
   - Inteligência artificial: **Híbrido** ou **Nuvem**
   - Modo de voz: **Tempo real (OpenAI)** (ou Básico para custo zero de voz)
   - **Palavra de ativação “Oi, Dia”: ligada**
5. Na tela inicial deve aparecer **“Disponível · diga ‘Oi, Dia’”**.

## Deixar sempre ligado

- **Carregador** conectado o tempo todo.
- A DIA mantém a **tela acesa** enquanto escuta. Em *Configurações › Tela*, deixe o brilho baixo se quiser.
- *Configurações › Apps › Chrome › Bateria* → **Sem restrições** (evita o Android pausar o Chrome).
- Opcional: **Fixar app** (*Configurações › Segurança › Fixar apps*) para a DIA ficar sempre em primeiro plano.
- Se a tela desligar ou o app for para segundo plano, a escuta para — o Android não permite microfone em segundo plano para páginas web. Ao voltar para a DIA, ela retoma sozinha.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| “Diga ‘Oi, Dia’” não aparece | Confirme que a opção está ligada em Ajustes e que está no **Chrome** |
| Não reconhece “DIA” | Fale “Oi, Dia” com uma pequena pausa; aproxime-se do aparelho |
| Sons de “bip” frequentes | Alguns aparelhos tocam um som a cada reinício do reconhecimento: em *Configurações › Sons*, reduza o volume de **notificações/sistema** (o volume de mídia da DIA continua normal) |
| Para de escutar depois de horas | Recarregue a página; verifique a otimização de bateria do Chrome |
