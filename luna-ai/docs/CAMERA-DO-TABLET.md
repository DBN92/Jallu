# Câmera do tablet

Três recursos usam a câmera da frente do aparelho onde a Luna está aberta. Funcionam no app Android
da Luna (1.0.8 ou mais nova) ou em qualquer navegador aberto por um endereço **https**. Pelo endereço
`http://192.168.15.6:8787` direto no navegador, o Android não libera a câmera.

## Acordar e escurecer (Ajustes › Descanso de tela)

- **Acordar quando alguém chegar perto**: sai do descanso de tela quando alguém se aproxima. Movimento
  ao fundo (gente passando longe) não tira do descanso.
- **Escurecer a tela sem ninguém por perto**: depois do tempo escolhido sem movimento, a tela escurece
  (no app o brilho baixa de verdade). Passar na frente ou tocar acende.
- Nada é gravado nem enviado: o aparelho compara imagens de 32×24 pontos, duas vezes por segundo.

## Gestos (Ajustes › Gestos)

Crie a regra com **Onde: Câmera do aparelho que analisa (frontal)** e ligue a análise de gestos no tablet.

## Recados em vídeo

- Toque em **Deixar recado** na tela inicial (ou diga “Oi, Luna, deixa um recado”). Até 30 segundos.
- Quem chegar vê o aviso no descanso de tela; ao tocar (ou chegar perto) o recado abre sozinho.
- “Oi, Luna, tem recado?” conta os recados novos e abre na tela.
- Ficam só no servidor da casa (`dados/recados`) e são apagados sozinhos depois de 7 dias.

## Como o app libera a câmera

O app abre a Luna por `http://127.0.0.1:8788`, uma ponte que roda só dentro do tablet e repassa tudo
para o endereço da Luna configurado. Para o Android, 127.0.0.1 é um endereço seguro, então a câmera
fica disponível. Na primeira abertura depois da atualização, o login e as preferências da tela são
levados junto automaticamente.

### Salvar ou descartar

Depois de assistir, escolha **Salvar** (o recado fica guardado e não some) ou **Descartar** (apaga na hora).
Sem escolher, ele some sozinho depois de 7 dias. O botão redondo com a câmera, no canto da tela inicial,
grava um recado novo (ou abre os recados novos, quando houver).

## Listas da casa

Na aba **Listas**: **Comprar** (✓ = comprei, o item vai para “Em casa”), **Em casa** (↺ = acabou, volta
para a lista de compras) e **Notas**. Pela voz: “põe leite e pão na lista”, “acabou o café”, “preciso
comprar sabão”, “comprei o leite”, “o que falta comprar?”, “tem arroz em casa?”, “cria uma nota: …”,
“lê minhas notas”.

## Avisos no celular (push)

Em **Ajustes › Avisos neste celular**, ligue para receber uma notificação quando alguém deixar um recado.
Tocar no aviso abre o recado.

- **iPhone**: precisa do iOS 16.4 ou mais novo e da Luna **instalada na tela de início** a partir do
  endereço **https** (Cloudflare). Pelo endereço `http://192.168.15.6:8787` o iPhone não permite avisos.
- **Android (celular)**: funciona no Chrome ou com a Luna instalada, também pelo endereço https.
- O aparelho que gravou o recado não recebe o aviso dele.
- As chaves dos avisos ficam em `dados/vapid.json`. O aviso passa pelo serviço gratuito de notificação
  do próprio celular (Apple ou Google), só com o texto curto “Fulano deixou um recado em vídeo”.
