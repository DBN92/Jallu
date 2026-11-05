# Câmeras de segurança (Yoosee e outras)

A Luna mostra as câmeras que estão no **Home Assistant**. O HA converte o vídeo da câmera
(RTSP) para um formato que o navegador toca; a Luna só repassa as imagens com segurança —
a senha da câmera e o token do HA **nunca** chegam ao celular, e as imagens **nunca** vão para a IA.

## 1. Preparar a câmera Yoosee

1. Descubra o **IP** da câmera: app Yoosee › câmera › ⚙ Configurações › Rede (ou na lista de
   aparelhos do seu roteador). Recomendo **fixar esse IP** no roteador (reserva DHCP).
2. Defina/anote a **senha da câmera**. No app Yoosee: ⚙ Configurações › **Segurança** —
   alguns modelos chamam de “senha do dispositivo” ou “senha NVR/ONVIF”. O usuário é **admin**.

## 2. Adicionar no Home Assistant (escolha uma opção)

### Opção A — ONVIF (recomendada: vídeo + girar/inclinar/zoom)
Home Assistant › **Configurações › Dispositivos e serviços › Adicionar integração › ONVIF**:
- Host: IP da câmera · Porta: **5000** · Usuário: **admin** · Senha: a da câmera

Câmeras motorizadas ganham controle de movimento na Luna automaticamente.

### Opção B — Câmera genérica (se a ONVIF não conectar)
**Adicionar integração › Generic Camera**:
- URL do stream: `rtsp://admin:SENHA@IP_DA_CAMERA:554/onvif1`
  (qualidade menor e mais leve: `.../onvif2`)
- Imagem estática: deixe em branco
- Transporte RTSP: TCP

Nesse modo há vídeo, mas sem girar/inclinar.

> Teste antes: no próprio Home Assistant, abra a entidade `camera.*` e confira se a imagem aparece.

## 3. Na Luna

- Aba **Câmeras**: miniaturas que se atualizam; toque para ver **ao vivo** em tela cheia.
- Tela inicial: painel **Câmeras** — toque para ampliar com vídeo e controles.
- Por voz: “**Luna, mostre a câmera da garagem**” ou “**quero ver as câmeras**”.
- Controles: segure as setas para **girar/inclinar** (solte para parar), **zoom**, **foto** e **tela cheia**.

Se o vídeo contínuo não iniciar (alguns modelos/firmwares), a Luna mostra automaticamente
**imagens atualizadas a cada segundo**.

## Dicas de segurança

- Não exponha as câmeras diretamente na internet (sem redirecionar portas no roteador).
  Fora de casa, o acesso já passa pela Luna/Cloudflare com login.
- Use uma senha forte nas câmeras e mantenha o firmware atualizado.
