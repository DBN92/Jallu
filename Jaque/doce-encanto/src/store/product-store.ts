import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product, products as initialProducts, categories as initialCategories } from '@/data/products'

interface ProductState {
  products: Product[]
  categories: string[]
  addProduct: (product: Omit<Product, 'id'>) => void
  updateProduct: (id: string, product: Partial<Product>) => void
  deleteProduct: (id: string) => void
  addCategory: (category: string) => void
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

// Catálogo do site é a fonte de verdade. Não há sincronização automática via agente aqui.

export const useProductStore = create<ProductState>()(
  persist(
    (set) => ({
      products: initialProducts,
      categories: initialCategories,
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
    }),
    {
      name: 'product-storage-v6',
    }
  )
)
