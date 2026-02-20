import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product, products as initialProducts, categories as initialCategories } from '@/data/products'
import { workopsAsk } from '@/lib/workops-agent'

interface ProductState {
  products: Product[]
  categories: string[]
  addProduct: (product: Omit<Product, 'id'>) => void
  updateProduct: (id: string, product: Partial<Product>) => void
  deleteProduct: (id: string) => void
  addCategory: (category: string) => void
  initializedFromWorkops: boolean
  loadFromWorkops: () => Promise<void>
}

function extractJson(text: string) {
  if (!text.includes('```')) {
    return text.trim()
  }

  const firstFence = text.indexOf('```')
  const afterFirst = text.slice(firstFence + 3)
  const secondFence = afterFirst.indexOf('```')
  const inside = secondFence === -1 ? afterFirst : afterFirst.slice(0, secondFence)
  let code = inside.trim()

  if (code.toLowerCase().startsWith('json')) {
    code = code.slice(4).trimStart()
  }

  return code
}

type WorkopsProduct = {
  id?: string
  name?: string
  nome?: string
  description?: string
  descricao?: string
  price?: number
  preco?: number
  preco_por_kg?: number
  category?: string
  categoria?: string
  image?: string
}

export const useProductStore = create<ProductState>()(
  persist(
    (set) => ({
      products: initialProducts,
      categories: initialCategories,
      initializedFromWorkops: false,
      addProduct: (product) =>
        set((state) => ({
          products: [
            ...state.products,
            { ...product, id: Math.random().toString(36).substr(2, 9) },
          ],
        })),
      updateProduct: (id, updatedProduct) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updatedProduct } : p
          ),
        })),
      deleteProduct: (id) =>
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        })),
      addCategory: (category) =>
        set((state) => ({
          categories: [...state.categories, category],
        })),
      loadFromWorkops: async () => {
        try {
          const response = await workopsAsk(
            'Liste todos os produtos do catálogo de e-commerce em JSON no formato {"products":[{"id":"...","name":"...","description":"...","price":0,"category":"...","image":"..."}]}. Responda apenas o JSON.'
          )

          const jsonText = extractJson(response)
          const parsed = JSON.parse(jsonText) as { products?: unknown }

          if (!parsed.products || !Array.isArray(parsed.products)) {
            set({ initializedFromWorkops: true })
            return
          }

          const products = (parsed.products as WorkopsProduct[]).map((p, index): Product => ({
            id: String(p.id ?? index + 1),
            name: String(p.name ?? p.nome ?? 'Produto'),
            description: String(p.description ?? p.descricao ?? ''),
            price: Number(p.price ?? p.preco ?? p.preco_por_kg ?? 0),
            category: String(p.category ?? p.categoria ?? 'Outros'),
            image: typeof p.image === 'string' ? p.image : undefined,
          }))

          const categories = Array.from(new Set(products.map((p) => p.category)))

          set({
            products,
            categories,
            initializedFromWorkops: true,
          })
        } catch {
          set({ initializedFromWorkops: true })
        }
      },
    }),
    {
      name: 'product-storage-v6',
    }
  )
)
