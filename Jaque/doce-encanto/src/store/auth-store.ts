import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { requireSupabaseConfig, supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  init: () => Promise<void>
  loginWithPassword: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

let unsubscribeAuth: (() => void) | null = null

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  init: async () => {
    if (unsubscribeAuth) return
    requireSupabaseConfig()

    try {
      const { data } = await supabase.auth.getSession()
      const session = data.session ?? null
      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: Boolean(session),
        isLoading: false,
        error: null,
      })

      const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        set({
          session: nextSession ?? null,
          user: nextSession?.user ?? null,
          isAuthenticated: Boolean(nextSession),
          isLoading: false,
          error: null,
        })
      })

      unsubscribeAuth = () => {
        listener.subscription.unsubscribe()
        unsubscribeAuth = null
        set({ isLoading: true, session: null, user: null, isAuthenticated: false, error: null })
      }
    } catch (err) {
      const msg =
        err instanceof TypeError && String(err.message).toLowerCase().includes('failed to fetch')
          ? 'Falha de conexão com o Supabase (Failed to fetch). Verifique VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, rede e se algum bloqueador está impedindo requisições.'
          : err instanceof Error
          ? err.message
          : 'Falha ao conectar no Supabase'
      set({ isLoading: false, isAuthenticated: false, session: null, user: null, error: msg })
      throw new Error(msg)
    }
  },

  loginWithPassword: async (email, password) => {
    requireSupabaseConfig()
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      set({
        session: data.session,
        user: data.user,
        isAuthenticated: Boolean(data.session),
        isLoading: false,
        error: null,
      })
    } catch (err) {
      const msg =
        err instanceof TypeError && String(err.message).toLowerCase().includes('failed to fetch')
          ? 'Falha de conexão com o Supabase (Failed to fetch). Verifique VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, rede e se algum bloqueador está impedindo requisições.'
          : err instanceof Error
          ? err.message
          : 'Erro ao realizar login'
      set({ isLoading: false, error: msg })
      throw new Error(msg)
    }
  },

  logout: async () => {
    requireSupabaseConfig()
    set({ isLoading: true, error: null })
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      const session = get().session
      if (session) {
        set({ session: null, user: null, isAuthenticated: false, isLoading: false, error: null })
      } else {
        set({ isLoading: false, error: null })
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao sair'
      set({ isLoading: false, error: msg })
      throw new Error(msg)
    }
  },
}))
