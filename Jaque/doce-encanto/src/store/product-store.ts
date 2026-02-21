import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/data/products'
import { supabase } from '@/lib/supabase'

const getCategoriesFromProducts = (products: Product[]) =>
  Array.from(new Set(products.map((p) => p.category)))

interface ProductState {
  products: Product[]
  categories: string[]
  isLoading: boolean
  error: string | null
  activeCategory: string
  
  fetchProducts: () => Promise<void>
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>
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

          if (error) throw error

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
          console.error('Erro ao adicionar produto:', err)
          set((state) => {
            const revertedProducts = state.products.filter((p) => p.id !== tempId)
            return {
              products: revertedProducts,
              categories: getCategoriesFromProducts(revertedProducts),
              error:
                err instanceof Error
                  ? err.message
                  : 'Erro ao adicionar produto',
            }
          })
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

          if (error) throw error
        } catch (err) {
          console.error('Erro ao atualizar produto:', err)
          set({
            products: originalProducts,
            categories: getCategoriesFromProducts(originalProducts),
            error:
              err instanceof Error
                ? err.message
                : 'Erro ao atualizar produto',
          })
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

          if (error) throw error
        } catch (err) {
          console.error('Erro ao deletar produto:', err)
          set({
            products: originalProducts,
            categories: getCategoriesFromProducts(originalProducts),
            error:
              err instanceof Error
                ? err.message
                : 'Erro ao deletar produto',
          })
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
