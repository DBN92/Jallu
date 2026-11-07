# Aspiradores robôs na DIA

A DIA controla qualquer aspirador robô que apareça no Home Assistant como entidade `vacuum.*`.
Ela não fala direto com a nuvem da Xiaomi nem da Neatsvor. O caminho é sempre:
robô → integração no Home Assistant → DIA.

## 1. Colocar os robôs no Home Assistant

Tudo é feito pela interface do Home Assistant, sem reinstalar nada:
**Configurações → Dispositivos e serviços → Adicionar integração**.

### Xiaomi

1. Tente primeiro a integração **Xiaomi Miio**, que já vem no Home Assistant.
   - Escolha entrar com a conta Xiaomi.
   - Ela busca o token do robô sozinha e depois controla o robô pela rede local.
2. Se o seu modelo não aparecer ou não funcionar, use a integração oficial da Xiaomi, **Xiaomi Home**.
   - Ela é instalada pelo HACS e funciona com a conta do app Mi Home.
   - Ela cobre os modelos mais novos.
3. Robôs da marca Roborock têm a integração própria **Roborock**.

### Neatsvor

1. Muitos modelos da Neatsvor são feitos sobre a plataforma Tuya. Abra o app **Smart Life** (ou Tuya Smart), o mesmo das suas lâmpadas e tomadas.
2. Tente adicionar o robô por **Adicionar dispositivo**.
3. Se ele entrar no Smart Life, aparece sozinho no Home Assistant pela integração **Tuya** que você já usa. Talvez seja preciso recarregar a integração.
4. Se o robô só funcionar no app próprio da Neatsvor e não aceitar o Smart Life, não há integração pública para ele. Nesse caso a DIA não consegue controlá-lo.

Depois disso, confira em **Ferramentas de desenvolvedor → Estados** se existe uma entidade `vacuum.…` para cada robô.

## 2. Na DIA

1. Os robôs aparecem sozinhos:
   - no cartão **Aspiradores** da tela inicial;
   - em **Minha casa → Aspiradores**.
2. Pelos botões, qualquer usuário logado pode:
   - **Aspirar** (ou **Continuar** depois de pausar);
   - **Pausar**;
   - mandar de volta para a **Base**;
   - **apitar para encontrar** o robô (ícone de mira), se o modelo tiver essa função;
   - escolher a **potência** de sucção (ícone de vento).
3. Para usar **voz e texto**, autorize cada robô:
   - abra **Minha casa → ajustar** (ícone de controles);
   - ligue **DIA pode controlar**.
4. Se quiser, dê um nome falado a cada robô pelo lápis, por exemplo "robô da sala" ou "Neatsvor".

O que mostrar no cartão depende do que o robô informa ao Home Assistant: bateria, potência e se ele sabe apitar.
A bateria também é lida do sensor separado que as integrações novas criam, como `sensor.<robô>_battery`.

## 3. Comandos de voz

| Você diz | A DIA faz |
| --- | --- |
| "Oi, Dia, aspira a casa" / "liga o aspirador" / "manda o Neatsvor limpar" | começa a limpar. Com dois robôs e nenhum nome dito, ela pergunta qual deve limpar (responda o nome ou "os dois"). |
| "pausa o aspirador" | pausa quem está limpando |
| "para o robô" | para no lugar |
| "manda o robô voltar pra base" / "desliga o aspirador" | manda para a base quem não está nela |
| "onde está o robô Xiaomi?" | faz o robô apitar |
| "como está o aspirador?" / "qual a bateria do robô?" | diz a situação e a bateria |

Automações e gestos também funcionam: "ligar" o robô = começar a limpar e "desligar" = voltar para a base.
Por exemplo, dá para criar uma automação "ao sair de casa, ligar o Robô Xiaomi".

## Limites (por segurança e por enquanto)

- A DIA só usa os comandos padrão de aspirador do Home Assistant: começar, pausar, parar, voltar para a base, apitar e potência. Ela nunca envia comandos livres (`send_command`) ao robô.
- Limpar **só um cômodo** ainda não é suportado, porque os cômodos são guardados de forma diferente em cada marca. Se você pedir "aspira a sala", a DIA avisa que ainda não consegue.
