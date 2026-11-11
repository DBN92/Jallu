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
- Por voz: “**Oi, Luna, mostre a câmera da garagem**” ou “**quero ver as câmeras**”.
- Controles: segure as setas para **girar/inclinar** (solte para parar), **zoom**, **foto** e **tela cheia**.

Se o vídeo contínuo não iniciar (alguns modelos/firmwares), a Luna mostra automaticamente
**imagens atualizadas a cada segundo**.

## Dicas de segurança

- Não exponha as câmeras diretamente na internet (sem redirecionar portas no roteador).
  Fora de casa, o acesso já passa pela Luna/Cloudflare com login.
- Use uma senha forte nas câmeras e mantenha o firmware atualizado.

## Câmeras diretas (quando o Home Assistant não mostra a câmera)

Algumas câmeras (ex.: **Yoosee em H.265 que só aceita UDP**) não funcionam pelo processador de vídeo do
Home Assistant: no log do HA aparecem `Invalid data found when processing input`, `Error demuxing stream`
ou `Connection refused`. Nesses casos a **própria Luna** lê a câmera:

1. Instale o conversor de vídeo (uma vez; o `update.sh` também faz isso automaticamente):
   `sudo bash scripts/ffmpeg-setup.sh` — baixa o ffmpeg estático (~29 MB) para `runtime/ffmpeg/`,
   confere o sha256, sem Docker e sem alterar o sistema.
2. Na Luna (como administrador): **Ajustes › Câmeras diretas › + Adicionar câmera direta**
   - Nome: ex. `Entrada` (uma câmera do HA com o mesmo nome deixa de aparecer na Luna)
   - Endereço: `rtsp://192.168.15.112:554/onvif1` (Yoosee: `onvif1` = principal, `onvif2` = leve)
   - Usuário `admin` e a senha da câmera (fica só no servidor; nunca volta ao navegador)
   - Protocolo: **UDP** para Yoosee
   - Toque em **Testar conexão** — deve mostrar algo como “Conectou: vídeo HEVC 1920x2160”.

Como funciona: enquanto alguém assiste, um único ffmpeg por câmera converte o vídeo para **H.264
(até 960 px, 10 quadros/s)**, que toca no iPhone, Android e Fire TV, e grava uma foto por segundo.
Sem ninguém assistindo por 45 s, ele desliga sozinho (não gasta CPU à toa).
Câmeras diretas não têm girar/inclinar (isso exige ONVIF no Home Assistant).

### Movimento das câmeras diretas (girar, inclinar, zoom)

Em **Ajustes › Câmeras diretas**, toque em **Ativar movimento** na câmera. A Luna procura o ONVIF nas
portas comuns (5000 nas Yoosee, depois 80, 8899, 8000, 8080, 2020), autentica com o mesmo usuário/senha
(digest WS-Security, a senha não trafega em texto) e salva a porta encontrada. Depois disso aparecem os
controles na tela da câmera (segure para mover) e, na TV, as setas do controle giram a câmera.
Se todas as portas aparecerem como “fechada”, o ONVIF está desligado: ative **ONVIF** ou **NVR** nas
configurações da câmera no app do fabricante. Se o comando para não chegar, a câmera para sozinha em 2,5 s.

## Comandos por gesto de mão (✋ acende, ✊ apaga…)

**Ajustes › Gestos (comandos por mão)**:
1. Escolha o gesto (✋ mão aberta, ✊ punho, 👍, 👎, ✌️, ☝️, 🤟), **onde** (uma câmera da Luna ou a câmera
   frontal do aparelho), a **ação** (ligar, desligar, alternar) e o **aparelho** (ou “todas as luzes”).
2. Use **Testar o reconhecimento** para ver ao vivo o que a Luna entende (mostra o gesto e a % de certeza).
3. Em câmeras diretas, **Área da câmera**: desenhe um retângulo só onde você costuma ficar — a mão fica
   maior na imagem e o reconhecimento melhora muito (essencial em câmeras de lente aberta, como as Yoosee).
4. Ligue **Analisar gestos neste aparelho** no aparelho que fica sempre com a Luna aberta (ex.: o Android da parede).

Como funciona: o aparelho busca ~3 quadros por segundo (só da área escolhida) e reconhece a mão com o
MediaPipe (Google), que roda **no próprio aparelho** — nenhuma imagem vai para a internet. O gesto precisa
ser mantido ~1 s (mão passando não conta); a mesma regra não repete por 5 s. A ação passa pelo servidor com
as mesmas validações e fica no histórico (origem “gesture”). O modelo (~8 MB) é baixado no build com sha256 conferido.

Como a Luna melhora o reconhecimento:
- **Segue a mão:** depois de achar a mão, analisa só a região em volta dela (zoom) nos quadros seguintes.
- **Procura mãos pequenas:** sem mão na imagem inteira, procura em 4 partes ampliadas (uma por quadro).
- **Tolera falhas:** decide pela maioria dos quadros recentes — um quadro borrado não cancela o gesto.
- **Sensibilidade** (por aparelho): *Alta* (longe/escuro), *Normal* ou *Precisa* (quase não aciona sem querer).
- Câmeras diretas enviam 4 quadros/s da área escolhida, até 1280 px.

A prévia mostra “mão vista — gesto não reconhecido” quando acha a mão mas não entende o gesto
(aproxime, vire a palma para a câmera ou melhore a luz) e como a mão foi achada (zoom, partes, imagem inteira).

Dicas: de frente para a câmera, a 1–3 m, com luz. À noite (infravermelho) funciona pior.

## Garagem: carro, portão e movimento (vigias por foto de referência)

**Ajustes › Garagem** (administrador):
1. Escolha a câmera e adicione **🚗 Carro**, **🚪 Portão** e/ou **👀 Movimento à noite**.
2. **Marcar área**: desenhe o retângulo onde o carro fica / onde está o portão.
3. Com a garagem **sem carro**, toque em “Salvar foto agora” em *fora*; com o carro, em *na garagem*.
   Faça o mesmo com o portão *fechado* e *aberto*. Salve 2–3 fotos de cada, **de dia e de noite**.
4. **Testar agora** mostra o que a Luna está vendo e a certeza.

Depois disso, a cada 15 s a Luna pega uma foto da câmera (sem ligar o vídeo), compara a área com as
fotos de referência e, quando o estado muda (confirmado em 2 leituras seguidas):
- registra o evento com a foto do momento (guardada 7 dias) e avisa em todas as telas abertas;
- à noite (18h–6h), acende a luz escolhida quando o portão abre / o carro chega e apaga após X min
  (não mexe se a luz já estava acesa);
- portão aberto além do tempo configurado (padrão 10 min) gera aviso, repetido a cada 30 min.
“Movimento à noite” avisa mudanças grandes na imagem das 18h às 6h (no máximo 1 aviso a cada 3 min).

Por voz: “Oi, Luna, o carro está na garagem?”, “o portão está aberto?”, “como está a garagem?”.
A Luna **não** abre/fecha o portão.
