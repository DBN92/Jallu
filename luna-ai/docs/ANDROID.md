# Android como assistente sempre ligada (“Ei, Luna”)

## Como funciona

| Etapa | Onde roda | Custo |
|---|---|---|
| Escutar a palavra “Luna” continuamente | Reconhecimento de fala do **Chrome** (Android) | Gratuito |
| Conversa depois do chamado | OpenAI Realtime (voz em tempo real) **ou** modo básico | Só durante a conversa |
| Encerrar a conversa | Automático após **30 s** sem fala | — |

A sessão da OpenAI **não** fica aberta o tempo todo: ela abre ao ouvir “Luna” (com um sinal sonoro) e fecha sozinha.
Você pode falar tudo de uma vez — “Ei Luna, acende a luz da sala” — ou só “Ei Luna” e esperar o sinal.

> Privacidade: enquanto espera o chamado, o áudio é processado pelo serviço de reconhecimento de fala do Google (é assim que o Chrome funciona). A Luna só envia o que vem **depois** de “Luna”.

## Preparar o aparelho

1. Use o **Google Chrome** (não o navegador da Samsung, nem apps “kiosk” baseados em WebView — eles não têm reconhecimento de fala).
2. Abra `https://luna.seudominio.com`, entre e toque em **⋮ › Instalar app** (ou “Adicionar à tela inicial”).
3. Abra a Luna pelo ícone e permita **microfone** e **localização**.
4. **Ajustes**:
   - Inteligência artificial: **Híbrido** ou **Nuvem**
   - Modo de voz: **Tempo real (OpenAI)** (ou Básico para custo zero de voz)
   - **Palavra de ativação “Ei, Luna”: ligada**
5. Na tela inicial deve aparecer **“Disponível · diga ‘Ei, Luna’”**.

## Deixar sempre ligado

- **Carregador** conectado o tempo todo.
- A Luna mantém a **tela acesa** enquanto escuta. Em *Configurações › Tela*, deixe o brilho baixo se quiser.
- *Configurações › Apps › Chrome › Bateria* → **Sem restrições** (evita o Android pausar o Chrome).
- Opcional: **Fixar app** (*Configurações › Segurança › Fixar apps*) para a Luna ficar sempre em primeiro plano.
- Se a tela desligar ou o app for para segundo plano, a escuta para — o Android não permite microfone em segundo plano para páginas web. Ao voltar para a Luna, ela retoma sozinha.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| “Diga ‘Ei, Luna’” não aparece | Confirme que a opção está ligada em Ajustes e que está no **Chrome** |
| Não reconhece “Luna” | Fale “Ei, Luna” com uma pequena pausa; aproxime-se do aparelho |
| Sons de “bip” frequentes | Alguns aparelhos tocam um som a cada reinício do reconhecimento: em *Configurações › Sons*, reduza o volume de **notificações/sistema** (o volume de mídia da Luna continua normal) |
| Para de escutar depois de horas | Recarregue a página; verifique a otimização de bateria do Chrome |
