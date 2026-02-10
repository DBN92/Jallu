import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ConfigState {
  whatsappNumber: string
  setWhatsappNumber: (number: string) => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      whatsappNumber: "5511999999999", // Default value
      setWhatsappNumber: (number) => set({ whatsappNumber: number }),
    }),
    {
      name: 'config-storage',
    }
  )
)
