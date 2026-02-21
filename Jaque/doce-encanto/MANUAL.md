# Manual do Usuário - Doce Encanto

Bem-vindo ao sistema de e-commerce da Doce Encanto. Este manual apresenta todas as funcionalidades da plataforma, tanto para o cliente final quanto para o administrador da loja.

---

## 📚 Índice

1. [Visão Geral](#1-visão-geral)
2. [Guia do Cliente (Loja Virtual)](#2-guia-do-cliente-loja-virtual)
3. [Guia do Administrador (Painel de Controle)](#3-guia-do-administrador-painel-de-controle)
    - [Acesso ao Painel](#31-acesso-ao-painel)
    - [Dashboard](#32-dashboard)
    - [Gestão de Produtos](#33-gestão-de-produtos)
    - [Gestão de Pedidos](#34-gestão-de-pedidos)
    - [Configurações da Loja](#35-configurações-da-loja)
4. [Integrações e Notificações](#4-integrações-e-notificações)

---

## 1. Visão Geral

O Doce Encanto é uma plataforma moderna de e-commerce focada em confeitaria, que utiliza um **Agente de IA** para auxiliar os clientes na finalização de compras e tirar dúvidas. O sistema é dividido em duas partes principais:

- **Loja (Frente de Loja)**: Onde os clientes navegam, escolhem produtos e fazem pedidos.
- **Painel Administrativo**: Onde o lojista gerencia produtos, pedidos e personaliza o site.

---

## 2. Guia do Cliente (Loja Virtual)

### Navegação
A página inicial apresenta:
- **Hero (Banners)**: Destaques principais e promoções.
- **Cardápio**: Listagem completa de produtos divididos por categorias.
- **Destaques**: Seção com os benefícios da loja.
- **Depoimentos**: Avaliações de clientes.
- **Rodapé**: Links úteis e informações de contato.

### Realizando um Pedido
1.  **Escolha os Produtos**: Navegue pelo cardápio e clique no botão **Adicionar** (+) nos itens desejados.
2.  **Carrinho de Compras**: Ao adicionar um item, uma gaveta lateral se abre mostrando o resumo do pedido. Você pode ajustar as quantidades ou remover itens.
3.  **Finalizar Compra**: Clique no botão **"Finalizar pelo Chat"**.
4.  **Agente de IA**: O chat será aberto automaticamente. O Agente (Jaque) irá confirmar os itens e solicitar informações de entrega (CEP e número) ou retirada.
5.  **Confirmação**: Após fornecer os dados, o pedido é confirmado e enviado para a loja.

### Acompanhamento de Pedidos
- O cliente pode clicar em **"Meus Pedidos"** no menu principal.
- Insira o **código do pedido** fornecido pelo Agente no chat.
- O sistema mostrará o status atual (Pendente, Aceito, Em Preparação, Concluído, etc.) e detalhes como itens e endereço.

---

## 3. Guia do Administrador (Painel de Controle)

### 3.1. Acesso ao Painel
Acesse a URL `/admin/login` (ex: `seusite.com/admin/login`).
Insira as credenciais de administrador configuradas no sistema.

### 3.2. Dashboard
A tela inicial do painel administrativo oferece uma visão rápida:
- **Resumo de Vendas**: Total de pedidos e receita.
- **Atalhos Rápidos**: Botões para gerenciar produtos e configurações.

### 3.3. Gestão de Produtos
Na aba **Produtos**, você pode:
- **Adicionar Novo Produto**: Clique no botão "+ Novo Produto". Preencha:
    - Nome
    - Descrição
    - Preço
    - Categoria (Bolos, Doces, Bebidas, etc.)
    - Imagem (URL da imagem)
- **Editar Produto**: Clique no ícone de lápis ao lado de um produto existente para alterar seus dados.
- **Excluir Produto**: Clique no ícone de lixeira para remover um produto do catálogo.

### 3.4. Gestão de Pedidos
Na aba **Pedidos**, você visualiza todos os pedidos recebidos.
- **Lista de Pedidos**: Veja uma tabela com Data, Cliente, Valor e Status.
- **Detalhes do Pedido**: Clique em "Ver detalhes" para abrir uma janela com:
    - Lista de itens comprados.
    - Endereço de entrega completo.
    - Status atual e histórico (timeline).
- **Alterar Status**:
    - **Aprovar**: Confirma que o pedido foi aceito.
    - **Rejeitar**: Cancela o pedido.
    - **Atualizar**: Mude para "Em preparação", "Saiu para entrega" ou "Concluído".
- **Comunicação Rápida**: Botões para enviar mensagens prontas via WhatsApp para o cliente (Confirmar pedido, Tirar dúvida, Cancelar).

### 3.5. Configurações da Loja
Na aba **Configurações**, você personaliza quase tudo no site sem precisar de programação:

#### Geral
- **WhatsApp da Loja**: Número para onde os links de contato irão apontar.
- **Taxa de Entrega**: Valor fixo cobrado para entregas.

#### Personalização da Home
- **Hero (Banners)**:
    - Adicione até 6 slides.
    - Para cada slide, defina: Título, Texto de destaque, Descrição, Imagem de fundo e Link do botão.
- **Depoimentos**:
    - Adicione até 6 depoimentos de clientes.
    - Defina Nome, Comentário e Nota (estrelas).
- **Textos e Títulos**:
    - Altere os títulos das seções (ex: "Nossos Benefícios", "O que dizem nossos clientes").
    - Personalize o texto do rodapé e da newsletter.

#### Agente de IA (Chat)
- **Nome e Avatar**: Defina como o agente se apresenta.
- **Mensagem de Boas-vindas**: O texto inicial que o cliente vê ao abrir o chat.
- **Placeholder**: O texto de dica na caixa de digitação.

---

## 4. Integrações e Notificações

### Notificações de Pedidos (Alertzy)
O sistema está integrado ao **Alertzy** para enviar notificações push imediatas para o celular do lojista sempre que um novo pedido for realizado.
- A notificação contém: Nome do cliente, Itens do pedido e Valor total.
- Um botão na notificação leva diretamente para o painel de pedidos.

### Banco de Dados (Supabase)
Todos os dados (produtos, pedidos, configurações) são salvos de forma segura no Supabase. O sistema mantém o histórico de pedidos e garante que as alterações no painel reflitam imediatamente na loja.
