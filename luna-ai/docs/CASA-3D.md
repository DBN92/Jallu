# Casa em 3D

Maquete 3D da casa (térreo e andar de cima) dentro da Luna, ligada ao Home Assistant.
Abra em **Minha casa → 3D**.

## Como funciona
- A maquete roda numa página própria (`apps/web/casa3d.html` + `apps/web/src/casa3d/main.js`, three.js) aberta num quadro pela tela `House3DPage`.
- A tela faz a ponte: manda para a maquete o estado real dos aparelhos e transforma os toques em comandos pelas rotas normais de `/api/devices` (ligar, desligar, brilho e cor). Nada é enviado direto ao Home Assistant pelo navegador.
- Mudanças feitas por fora (interruptor, app, voz) aparecem na maquete em tempo real.

## Itens ligados ao Home Assistant
| Item da maquete | Cômodo | Tipos aceitos |
| --- | --- | --- |
| Cabeceira | Suíte | luz, interruptor |
| Ventilador | Suíte | ventilador, interruptor |
| Led Luiza | Quarto do bebê | luz, interruptor |
| Luminária | Sala | luz, interruptor (intensidade e cor aparecem se a lâmpada tiver) |
| Luz da Garagem | Garagem | luz, interruptor |

## Vínculos
- **Automático:** a Luna usa o aparelho controlável do tipo certo com exatamente o mesmo nome do item (ignora acentos e maiúsculas). Se houver dois com o mesmo nome, não escolhe nenhum.
- **Manual (só administrador):** botão **Vínculos** na tela da maquete. Dá para escolher outro aparelho ou "Nenhum".
- Item sem vínculo aparece na maquete sem botão. A Luna nunca inventa entidade: só lista aparelhos que vieram do Home Assistant.

## Desempenho
- A tela só é redesenhada quando algo muda; parada, quase não usa o processador.
- As sombras são calculadas só quando a cena muda.
- Se o aparelho ficar lento, a maquete entra sozinha no modo leve (sem desfoque nos menus e com resolução menor).
