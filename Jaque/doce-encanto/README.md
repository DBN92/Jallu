# Jallu Confeitaria

Site institucional e e-commerce simplificado para a **Jallu Confeitaria**, desenvolvido com Next.js 14, Tailwind CSS e Shadcn/UI.

## 🚀 Tecnologias

- **Framework:** Next.js 14 (App Router)
- **Estilização:** Tailwind CSS
- **Componentes:** Shadcn/UI
- **Linguagem:** TypeScript
- **Ícones:** Lucide React
- **Animações:** Framer Motion
- **Gerenciamento de Estado:** Zustand (Carrinho e Admin)

## 🎨 Identidade Visual (Premium Rosé)

- **Creme Baunilha (#FFF4EE):** 70% (Fundo)
- **Rosé Jallu (#D98BA6):** 20% (Destaque Principal)
- **Cacau (#3B2B2B):** 10% (Texto/Contraste)
- **Dourado Suave (#C9A46A):** Detalhes finos

## 📦 Funcionalidades

- **Landing Page Completa:** Hero, Categorias, Benefícios, Vitrine, Depoimentos, Newsletter.
- **Carrinho de Compras:** Adição de itens e checkout via WhatsApp.
- **Painel Administrativo:**
  - Login (`/admin/login`) - Credenciais configuradas via variáveis de ambiente (.env.local)
  - CRUD de Produtos (Criar, Ler, Atualizar, Deletar)
  - Persistência local de dados

## ▶️ Como Rodar

1. Instale as dependências:
   ```bash
   pnpm install
   ```

2. Rode o servidor de desenvolvimento:
   ```bash
   pnpm dev
   ```

3. Acesse `http://localhost:3000`

## Build para produção

Para criar uma versão otimizada para produção:

```bash
pnpm build
# ou
npm run build
```

## Deploy (Cloudflare Pages)

Este projeto está configurado para deploy no **Cloudflare Pages** usando o adaptador `@cloudflare/next-on-pages`.

### Configuração Obrigatória no Cloudflare:

1. Acesse o painel do seu projeto no **Cloudflare Pages**.
2. Vá em **Settings** > **Builds & deployments** > **Build configuration**.
3. Clique em **Edit configuration** e preencha exatamente assim:

| Campo | Valor |
|-------|-------|
| **Framework preset** | `None` |
| **Build command** | `npm run pages:build` |
| **Build output directory** | `.vercel/output/static` |
| **Root directory** | `Jaque/doce-encanto` |

4. Salve e vá na aba **Deployments** para tentar novamente.

---

## Deploy (Vercel)

## Estrutura do Projeto

- `/src/app`: Páginas e Layout (App Router)
- `/src/components`: Componentes da aplicação
- `/src/components/ui`: Componentes base (botões, inputs, cards, etc.)
- `/src/data`: Dados mockados dos produtos
- `/src/store`: Gerenciamento de estado (Carrinho)
