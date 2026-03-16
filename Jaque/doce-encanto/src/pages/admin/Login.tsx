
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useAuthStore } from "@/store/auth-store"
import { toast } from "sonner"
import { Lock } from "lucide-react"

const loginSchema = z.object({
  email: z.string().min(1, "E-mail é obrigatório").email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const navigate = useNavigate()
  const loginWithPassword = useAuthStore((state) => state.loginWithPassword)
  const init = useAuthStore((state) => state.init)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      await init()
      await loginWithPassword(data.email, data.password)
      toast.success("Login realizado com sucesso!")
      navigate("/admin/dashboard")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao realizar login. Tente novamente."
      toast.error(msg)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4">
      <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-8 w-8" />
          </div>
          <div>
            <CardTitle className="text-2xl font-serif font-bold text-primary">Área Administrativa</CardTitle>
            <CardDescription>Entre com suas credenciais para gerenciar o site</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                E-mail
              </label>
              <Input 
                {...register("email")} 
                placeholder="admin@seusite.com" 
                className="h-11"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Senha
              </label>
              <Input
                {...register("password")}
                type="password"
                placeholder="••••••"
                className="h-11"
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button 
              type="submit" 
              className="w-full h-11 text-base font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
