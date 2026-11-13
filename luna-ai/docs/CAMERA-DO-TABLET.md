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
