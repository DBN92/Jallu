# Aspiradores robôs na Luna

A Luna controla qualquer aspirador robô que apareça no Home Assistant como entidade `vacuum.*`.
Ela não fala direto com a nuvem da Xiaomi nem da Neatsvor. O caminho é sempre:
robô → integração no Home Assistant → Luna.

## 1. Colocar os robôs no Home Assistant

Nada precisa ser reinstalado. As integrações são adicionadas em **Configurações → Dispositivos e serviços → Adicionar integração**.

### Xiaomi: integração oficial **Xiaomi Home** (recomendada)

A Xiaomi Home é a integração oficial da Xiaomi para o Home Assistant. Ela traz os aparelhos do app Mi Home pela conta Xiaomi.
O Home Assistant precisa estar na versão **2024.4.4 ou mais nova**.

**1. Instalar.** A instalação só coloca uma pasta nova na configuração do Home Assistant. Não muda o que já existe.
Para desfazer, basta apagar a pasta `custom_components/xiaomi_home` e reiniciar.

Se você usa o HACS, procure **Xiaomi Home** em HACS → Baixar e reinicie o Home Assistant.

Sem HACS, rode no terminal do ZimaOS. O contêiner do Home Assistant se chama `homeassistant`:

```bash
# confere a versão do Home Assistant (precisa ser 2024.4.4 ou mais nova)
sudo docker exec homeassistant python3 -c "from homeassistant.const import __version__; print(__version__)"

# baixa a versão v0.5.0 da Xiaomi Home e copia para custom_components
sudo docker exec homeassistant sh -c 'cd /tmp && wget -qO xh.zip https://github.com/XiaoMi/ha_xiaomi_home/archive/refs/tags/v0.5.0.zip && unzip -oq xh.zip && mkdir -p /config/custom_components && rm -rf /config/custom_components/xiaomi_home && cp -r ha_xiaomi_home-0.5.0/custom_components/xiaomi_home /config/custom_components/ && rm -rf xh.zip ha_xiaomi_home-0.5.0 && echo "Xiaomi Home instalada"'

# reinicia o Home Assistant (cerca de 1 minuto fora do ar)
sudo docker restart homeassistant
```

**2. Entrar com a conta Xiaomi.**
1. No Home Assistant, abra **Configurações → Dispositivos e serviços → Adicionar integração → Xiaomi Home**.
2. Escolha o idioma **Português (Brasil)**. Assim os nomes das entidades vêm em português.
3. Em **Região de Login**, escolha a região da sua conta Xiaomi.
   - No app Xiaomi Home ela aparece em Perfil → Configurações adicionais → Sobre o Xiaomi Home.
   - As opções são China continental, Europe, India, Russia, Singapore e United States.
4. Marque **Configuração de Rede Integrada** (a própria integração recomenda na primeira vez).
5. O campo **URL de Redirecionamento OAuth2** é fixo em `http://homeassistant.local:8123`.
   - No ZimaOS com Docker, esse nome normalmente não abre.
   - Faça o login pelo celular ou computador **na mesma rede de casa**: toque em **"Clique aqui para entrar"** e entre com a conta Xiaomi.
   - Depois de entrar com a conta Xiaomi, o navegador vai para `http://homeassistant.local:8123/api/webhook/…` e mostra erro.
   - Na barra de endereço, troque só `homeassistant.local` pelo IP do ZimaOS. Mantenha a porta `:8123` e todo o resto, e abra de novo.
6. Escolha a casa e marque o robô aspirador. Os outros aparelhos Xiaomi também podem entrar.

Sem um gateway central da Xiaomi (vendido só na China), os comandos passam pela nuvem da Xiaomi. É normal levar 1 a 3 segundos.

**3. Na Luna não precisa configurar nada** (para comandos de voz, só autorize o robô, como na seção 2).
A Xiaomi Home cria dezenas de entidades para o robô: bateria, escovas, "não perturbe" e outras.
A Luna usa o registro de dispositivos do Home Assistant para:
- ligar a bateria ao robô certo;
- esconder as outras entidades do robô da lista de aparelhos.

Assim, o robô aparece como um único cartão.

**Alternativas:** a integração **Xiaomi Miio**, que já vem no Home Assistant, funciona com robôs mais antigos e controla pela rede local.
Robôs da marca Roborock têm a integração **Roborock**.

### Neatsvor

1. Muitos modelos da Neatsvor são feitos sobre a plataforma Tuya. Abra o app **Smart Life** (ou Tuya Smart), o mesmo das suas lâmpadas e tomadas.
2. Tente adicionar o robô por **Adicionar dispositivo**.
3. Se ele entrar no Smart Life, aparece sozinho no Home Assistant pela integração **Tuya** que você já usa. Talvez seja preciso recarregar a integração.
4. Se o robô só funcionar no app próprio da Neatsvor e não aceitar o Smart Life, não há integração pública para ele. Nesse caso a Luna não consegue controlá-lo.

Depois disso, confira em **Ferramentas de desenvolvedor → Estados** se existe uma entidade `vacuum.…` para cada robô.

## 2. Na Luna

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
   - ligue **Luna pode controlar**.
4. Se quiser, dê um nome falado a cada robô pelo lápis, por exemplo "robô da sala" ou "Neatsvor".

O que mostrar no cartão depende do que o robô informa ao Home Assistant: bateria, potência e se ele sabe apitar.
A bateria também é lida do sensor separado que as integrações novas criam, como `sensor.<robô>_battery`.

## Tela completa do robô e foto

Toque no robô no cartão da tela inicial ou em **Mais opções**. A tela completa mostra o que o robô oferece.
Na Xiaomi Home, ela pode ter:
- **Sucção**;
- **Água do pano**;
- **Estação**: lavar pano, secar ou parar a secagem, esvaziar o pó;
- **Manutenção**: escovas, filtro e pano. Toque em uma peça para zerar a contagem depois de trocá-la;
- **Limpezas**: área e quantidade, além dos agendamentos feitos no app do fabricante;
- **Ajustes**: não perturbe, reforço no tapete, continuar de onde parou e trava infantil.

A Luna só aciona controles dessa lista. Ela nunca chama outros comandos do robô.

**Foto do robô:** toque na imagem do robô, ou em ⋯ → *Usar foto do meu robô*, e escolha uma foto. A foto de cima fica melhor.
A Luna recorta e reduz a foto no celular e guarda no servidor, em `data/device-photos`.
A foto aparece no cartão, na tela completa e na animação de começo e fim. Para voltar ao desenho, use ⋯ → *Remover foto*.

## 3. Comandos de voz

| Você diz | A Luna faz |
| --- | --- |
| "Luna, aspira a casa" / "liga o aspirador" / "manda o Neatsvor limpar" | começa a limpar. Com dois robôs e nenhum nome dito, ela pergunta qual deve limpar (responda o nome ou "os dois"). |
| "pausa o aspirador" | pausa quem está limpando |
| "para o robô" | para no lugar |
| "manda o robô voltar pra base" / "desliga o aspirador" | manda para a base quem não está nela |
| "onde está o robô Xiaomi?" | faz o robô apitar |
| "como está o aspirador?" / "qual a bateria do robô?" | diz a situação e a bateria |

Automações e gestos também funcionam: "ligar" o robô = começar a limpar e "desligar" = voltar para a base.
Por exemplo, dá para criar uma automação "ao sair de casa, ligar o Robô Xiaomi".

## Limites (por segurança e por enquanto)

- A Luna só usa os comandos padrão de aspirador do Home Assistant: começar, pausar, parar, voltar para a base, apitar e potência. Ela nunca envia comandos livres (`send_command`) ao robô.
- Limpar **só um cômodo** ainda não é suportado, porque os cômodos são guardados de forma diferente em cada marca. Se você pedir "aspira a sala", a Luna avisa que ainda não consegue.
