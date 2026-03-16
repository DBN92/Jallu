import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
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

  init: async () => {
    if (unsubscribeAuth) return

    const { data } = await supabase.auth.getSession()
    const session = data.session ?? null
    set({
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session),
      isLoading: false,
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      set({
        session: nextSession ?? null,
        user: nextSession?.user ?? null,
        isAuthenticated: Boolean(nextSession),
        isLoading: false,
      })
    })

    unsubscribeAuth = () => {
      listener.subscription.unsubscribe()
      unsubscribeAuth = null
      set({ isLoading: true, session: null, user: null, isAuthenticated: false })
    }
  },

  loginWithPassword: async (email, password) => {
    set({ isLoading: true })
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      set({ isLoading: false })
      throw new Error(error.message)
    }
    set({
      session: data.session,
      user: data.user,
      isAuthenticated: Boolean(data.session),
      isLoading: false,
    })
  },

  logout: async () => {
    set({ isLoading: true })
    const { error } = await supabase.auth.signOut()
    if (error) {
      set({ isLoading: false })
      throw new Error(error.message)
    }
    const session = get().session
    if (session) {
      set({ session: null, user: null, isAuthenticated: false, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },
}))
