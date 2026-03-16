import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/data/products'
import { supabase } from '@/lib/supabase'

const getCategoriesFromProducts = (products: Product[]) =>
  Array.from(new Set(products.map((p) => p.category)))

type SupabaseLikeError = { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }

const toError = (err: unknown, fallbackMessage: string) => {
  if (err instanceof Error) return err
  if (err && typeof err === 'object') {
    const e = err as SupabaseLikeError
    const msg = String(e.message ?? '').trim()
    const details = String(e.details ?? '').trim()
    const hint = String(e.hint ?? '').trim()
    const code = String(e.code ?? '').trim()
    const parts = [msg, details, hint, code ? `code=${code}` : ''].filter(Boolean)
    if (parts.length) return new Error(parts.join(' | '))
  }
  return new Error(fallbackMessage)
}

interface ProductState {
  products: Product[]
  categories: string[]
  isLoading: boolean
  error: string | null
  activeCategory: string
  
  fetchProducts: () => Promise<void>
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>
  addProductsBulk: (products: Array<Omit<Product, 'id'>>) => Promise<void>
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  addCategory: (category: string) => void
  setActiveCategory: (category: string) => void
}

// Catálogo do site é a fonte de verdade.
// Agora sincronizado com Supabase para resiliência e persistência real.

export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      products: [],
      categories: [],
      isLoading: false,
      error: null,
      activeCategory: 'Todos',

      fetchProducts: async () => {
        set({ isLoading: true, error: null })
        try {
          const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('active', true)
          
          if (error) throw error
          
          if (data && data.length > 0) {
            const mappedProducts = data.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description || '',
              price: Number(p.price),
              category: p.category,
              image: p.image,
            }))

            set({
              products: mappedProducts,
              categories: getCategoriesFromProducts(mappedProducts),
            })
          }
        } catch (err) {
          console.error('Erro ao buscar produtos do Supabase:', err)
          if (err instanceof Error) {
            set({ error: err.message })
          } else {
            set({ error: 'Erro ao buscar produtos do Supabase' })
          }
          // Mantém produtos locais (persistidos) em caso de erro
        } finally {
          set({ isLoading: false })
        }
      },

      addProduct: async (product) => {
        const tempId = Math.random().toString(36).substr(2, 9)
        const optimisticProduct = { ...product, id: tempId }
        
        // UI Otimista
        set((state) => ({
          products: [...state.products, optimisticProduct]
        }))

        try {
          const { data, error } = await supabase
            .from('products')
            .insert([
              {
                name: product.name,
                description: product.description,
                price: product.price,
                category: product.category,
                image: product.image,
                active: true,
              },
            ])
            .select()
            .single()

          if (error) throw toError(error, 'Erro ao adicionar produto')

          if (data) {
            set((state) => {
              const updatedProducts = state.products.map((p) =>
                p.id === tempId
                  ? {
                      ...p,
                      id: data.id,
                      price: Number(data.price),
                    }
                  : p
              )
              return {
                products: updatedProducts,
                categories: getCategoriesFromProducts(updatedProducts),
              }
            })
          }
        } catch (err) {
          const e = toError(err, 'Erro ao adicionar produto')
          console.error('Erro ao adicionar produto:', err)
          set((state) => {
            const revertedProducts = state.products.filter((p) => p.id !== tempId)
            return {
              products: revertedProducts,
              categories: getCategoriesFromProducts(revertedProducts),
              error: e.message,
            }
          })
          throw e
        }
      },

      addProductsBulk: async (incoming) => {
        const normalized = incoming
          .map((p) => ({
            ...p,
            name: String(p.name ?? '').trim(),
            category: String(p.category ?? '').trim(),
            description: String(p.description ?? '').trim(),
            image: p.image ? String(p.image).trim() : undefined,
            price: Number(p.price),
          }))
          .filter((p) => p.name && p.category && p.description && !Number.isNaN(p.price))

        if (normalized.length === 0) return

        const tempEntries = normalized.map((p) => ({
          ...p,
          id: Math.random().toString(36).slice(2, 11),
        }))

        const previous = get().products

        set((state) => {
          const updated = [...state.products, ...tempEntries]
          return {
            products: updated,
            categories: getCategoriesFromProducts(updated),
          }
        })

        try {
          const { data, error } = await supabase
            .from('products')
            .insert(
              normalized.map((p) => ({
                name: p.name,
                description: p.description,
                price: p.price,
                category: p.category,
                image: p.image,
                active: true,
              }))
            )
            .select()

          if (error) throw toError(error, 'Erro ao adicionar produtos em massa')

          if (data && data.length > 0) {
            set((state) => {
              const mappedInserted = data.map((row) => ({
                id: row.id,
                name: row.name,
                description: row.description || '',
                price: Number(row.price),
                category: row.category,
                image: row.image,
              }))

              const keep = state.products.filter((p) => !tempEntries.some((t) => t.id === p.id))
              const updated = [...keep, ...mappedInserted]
              return {
                products: updated,
                categories: getCategoriesFromProducts(updated),
              }
            })
          }
        } catch (err) {
          const e = toError(err, 'Erro ao adicionar produtos em massa')
          console.error('Erro ao adicionar produtos em massa:', err)
          set({
            products: previous,
            categories: getCategoriesFromProducts(previous),
            error: e.message,
          })
          throw e
        }
      },

      updateProduct: async (id, updatedProduct) => {
        const originalProducts = get().products
        
        const updatedLocal = get().products.map((p) =>
          p.id === id ? { ...p, ...updatedProduct } : p
        )

        set({
          products: updatedLocal,
          categories: getCategoriesFromProducts(updatedLocal),
        })
        
        try {
          const dbPayload: Partial<Product> = { ...updatedProduct }

          const { error } = await supabase
            .from('products')
            .update(dbPayload)
            .eq('id', id)

          if (error) throw toError(error, 'Erro ao atualizar produto')
        } catch (err) {
          const e = toError(err, 'Erro ao atualizar produto')
          console.error('Erro ao atualizar produto:', err)
          set({
            products: originalProducts,
            categories: getCategoriesFromProducts(originalProducts),
            error: e.message,
          })
          throw e
        }
      },

      deleteProduct: async (id) => {
        const originalProducts = get().products
        
        const withoutProduct = get().products.filter((p) => p.id !== id)

        set({
          products: withoutProduct,
          categories: getCategoriesFromProducts(withoutProduct),
        })
        
        try {
          const { error } = await supabase
            .from('products')
            .update({ active: false })
            .eq('id', id)

          if (error) throw toError(error, 'Erro ao deletar produto')
        } catch (err) {
          const e = toError(err, 'Erro ao deletar produto')
          console.error('Erro ao deletar produto:', err)
          set({
            products: originalProducts,
            categories: getCategoriesFromProducts(originalProducts),
            error: e.message,
          })
          throw e
        }
      },

      addCategory: (category) =>
        set((state) => ({
          categories: [...state.categories, category],
        })),
      setActiveCategory: (category) => set({ activeCategory: category }),
    }),
    {
      name: 'product-storage-v8',
      partialize: (state) => ({
        products: state.products,
        categories: state.categories,
        activeCategory: state.activeCategory,
      }),
    }
  )
)
