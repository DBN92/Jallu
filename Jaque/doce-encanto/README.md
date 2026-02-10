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

## Deploy

A maneira mais fácil de fazer o deploy é usando a [Vercel](https://vercel.com/):

1. Crie um repositório no GitHub/GitLab com este código.
2. Importe o projeto na Vercel.
3. As configurações padrão do Next.js funcionarão automaticamente.

## Estrutura do Projeto

- `/src/app`: Páginas e Layout (App Router)
- `/src/components`: Componentes da aplicação
- `/src/components/ui`: Componentes base (botões, inputs, cards, etc.)
- `/src/data`: Dados mockados dos produtos
- `/src/store`: Gerenciamento de estado (Carrinho)
