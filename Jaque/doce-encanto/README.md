# Jallu Confeitaria

Projeto moderno de e-commerce para a Jallu Confeitaria, desenvolvido com **Vite + React**, **Tailwind CSS** e **Supabase**.

Este projeto inclui uma loja virtual completa para o cliente final e um painel administrativo robusto para gestão de produtos, pedidos e configurações da loja.

---

## 🚀 Começando

Siga estas instruções para obter uma cópia do projeto em operação na sua máquina local para fins de desenvolvimento e teste.

### Pré-requisitos

Você precisa ter o Node.js instalado (versão 18 ou superior recomendada).

### Instalação

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/DBN92/Jallu.git
    cd doce-encanto
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    # ou
    pnpm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto (`doce-encanto/`) com as seguintes chaves (solicite os valores ao administrador do projeto ou configure seu próprio Supabase/WorkOps):

    ```env
    VITE_SUPABASE_URL=sua_url_supabase
    VITE_SUPABASE_ANON_KEY=sua_key_supabase
    VITE_WORKOPS_AGENT_TOKEN=seu_token_workops
    VITE_WORKOPS_AGENT_URL=url_agente
    VITE_WORKOPS_INGEST_URL=url_ingestao
    VITE_ALERTZY_ACCOUNT_KEY=sua_key_alertzy
    ```

4.  **Rodar localmente:**
    ```bash
    npm run dev
    ```
    Acesse `http://localhost:5173` no seu navegador.

---

## 📖 Documentação e Manual de Uso

Para um guia completo sobre como utilizar todas as funcionalidades da loja e do painel administrativo, consulte o **[Manual do Usuário](MANUAL.md)**.

Ele cobre:
- Como gerenciar produtos e pedidos.
- Como personalizar a loja (banners, textos, depoimentos).
- Como o cliente realiza compras via Agente de IA.
- Configurações de notificações e integrações.

---

## 🛠️ Tecnologias Utilizadas

*   [Vite](https://vitejs.dev/) - Build tool e servidor de desenvolvimento.
*   [React](https://react.dev/) - Biblioteca para construção de interfaces.
*   [Tailwind CSS](https://tailwindcss.com/) - Framework CSS utilitário.
*   [Supabase](https://supabase.com/) - Backend as a Service (Banco de dados e Autenticação).
*   [Zustand](https://github.com/pmndrs/zustand) - Gerenciamento de estado global.
*   [Framer Motion](https://www.framer.com/motion/) - Biblioteca de animações.
*   [Lucide React](https://lucide.dev/) - Ícones.
*   [Sonner](https://sonner.emilkowal.ski/) - Notificações (Toasts).
*   [Alertzy](https://alertzy.app/) - Notificações Push para admin.

---

## 📦 Deploy

O projeto está configurado para deploy na **Vercel**.
Basta conectar o repositório à Vercel e configurar as variáveis de ambiente no painel do projeto.

---

Desenvolvido com ❤️ para Jallu Confeitaria.
