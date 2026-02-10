# Jallu Confeitaria

Projeto moderno para a Jallu Confeitaria, desenvolvido com Next.js 16, Tailwind CSS e Framer Motion.

## Configuração do Projeto

1.  **Instalação de dependências:**
    ```bash
    pnpm install
    ```

2.  **Variáveis de Ambiente:**
    Crie um arquivo `.env.local` na raiz do projeto com as credenciais do admin:
    ```env
    ADMIN_USER=seu_usuario
    ADMIN_PASSWORD=sua_senha
    ```

3.  **Rodar localmente:**
    ```bash
    pnpm dev
    ```

## Deploy no Cloudflare Pages

Para fazer o deploy corretamente no Cloudflare Pages usando a integração com Git:

1.  Acesse o dashboard do Cloudflare Pages e conecte seu repositório Git.
2.  Nas configurações de build (**Build settings**), use:
    *   **Framework preset:** `Next.js (Static HTML Export)` ou `None`
    *   **Build command:** `npm run pages:build`
    *   **Build output directory:** `.vercel/output/static`
    *   **Root directory:** `/` (ou deixe em branco se o `package.json` estiver na raiz)

**Importante:** Não use o comando `npm run deploy:manual` no campo "Build command" do Cloudflare. Esse comando é apenas para deploys manuais via terminal local.
