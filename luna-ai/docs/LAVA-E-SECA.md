# Lava e seca na Luna

A Luna mostra a lava e seca Midea pela integração **Midea AC LAN** do Home Assistant (aparelho tipo DB).
Ela acha a máquina sozinha: procura os sensores `…_time_remaining`, `…_progress` e `…_status` do mesmo aparelho.
As entidades da máquina saem da lista de aparelhos e viram um cartão próprio.

## O que aparece
- **Cartão na tela inicial**: situação (Lavando, Enxaguando, Centrifugando, Secando, Pausada, Terminou), tempo que falta, hora de término e as etapas.
- **Tela completa** (Mais opções):
  - anel com o tempo restante, hora de início e de término;
  - ciclo atual: programa, temperatura, centrifugação e tempos que a máquina informa;
  - botões Começar/Continuar, Pausar e Ligar/Desligar.
- **"Roupa pronta!"**: aviso em todas as telas abertas (celular, tablet e TV) quando o ciclo termina.
  No tablet com o app Luna 1.0.4 ou mais novo, ele também fala "A roupa está pronta".
- **Uso**: ciclos na semana e duração média, contados pela Luna a partir da instalação.

A máquina **não informa** consumo de água, consumo de energia nem se a porta foi aberta. Por isso a Luna não mostra esses dados.
Programas que a integração não conhece aparecem pelo número, por exemplo "Programa 119".

## Botões
- **Começar** só funciona com a máquina ligada e o programa escolhido no painel.
- Algumas máquinas só aceitam comandos pelo celular com o **controle remoto** ligado no painel.
  Se o botão não fizer nada, confira esse ajuste no manual da máquina.

## Voz
| Você diz | A Luna faz |
| --- | --- |
| "Oi, Luna, quanto falta para a máquina?" / "a roupa está pronta?" | diz a etapa, o tempo que falta e a hora de término |
| "pausa a máquina de lavar" / "continua a lavagem" | pausa ou continua* |
| "desliga a lava e seca" | desliga* |

\* Comandos só funcionam com **Luna pode controlar pela voz** ligado na tela da máquina. Apenas um administrador pode ligar esse ajuste.

## Diagnóstico
`sudo bash scripts/diagnostico.sh lavadora` lista tudo o que a integração Midea criou. O comando só lê dados e não mostra o token.
