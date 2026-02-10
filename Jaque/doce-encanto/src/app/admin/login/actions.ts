"use server"

import { z } from "zod"

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
})

type LoginData = z.infer<typeof loginSchema>

export async function validateCredentials(data: LoginData) {
  const envUsername = process.env.ADMIN_USERNAME
  const envPassword = process.env.ADMIN_PASSWORD

  if (!envUsername || !envPassword) {
    console.error("Admin credentials are not set in environment variables.")
    return { success: false, message: "Erro de configuração do servidor." }
  }

  if (data.username === envUsername && data.password === envPassword) {
    return { success: true }
  }

  return { success: false, message: "Credenciais inválidas" }
}
