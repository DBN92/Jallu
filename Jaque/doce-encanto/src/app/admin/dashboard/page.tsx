"use client"

import { useState, useEffect } from "react"
import { useProductStore } from "@/store/product-store"
import { useAuthStore } from "@/store/auth-store"
import { useConfigStore } from "@/store/config-store"
import { Product } from "@/data/products"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, Edit, LogOut, Package, ArrowLeft, Settings, Phone } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const productSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().min(1, "Descrição é obrigatória"),
  price: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Preço inválido"),
  category: z.string().min(1, "Categoria é obrigatória"),
  image: z.union([z.literal(""), z.string().url("URL inválida")]).optional(),
})

type ProductForm = z.infer<typeof productSchema>

export default function DashboardPage() {
  const router = useRouter()
  const { products, categories, deleteProduct, addProduct, updateProduct } =
    useProductStore()
  const logout = useAuthStore((state) => state.logout)
  const { whatsappNumber, setWhatsappNumber } = useConfigStore()
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [phoneInput, setPhoneInput] = useState(whatsappNumber)

  useEffect(() => {
    setPhoneInput(whatsappNumber)
  }, [whatsappNumber])

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
  })

  const onSubmit = (data: ProductForm) => {
    // Manually convert price to number for the store
    const payload = {
      ...data,
      price: parseFloat(data.price)
    } as unknown as Omit<Product, 'id'>

    if (editingId) {
      updateProduct(editingId, payload)
      toast.success("Produto atualizado com sucesso!")
    } else {
      addProduct(payload)
      toast.success("Produto criado com sucesso!")
    }
    setIsOpen(false)
    reset()
    setEditingId(null)
  }

  const handleEdit = (product: Product) => {
    setEditingId(product.id)
    setValue("name", product.name)
    setValue("description", product.description)
    setValue("price", product.price.toString())
    setValue("category", product.category)
    setValue("image", product.image)
    setIsOpen(true)
  }

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este produto?")) {
      deleteProduct(id)
      toast.success("Produto excluído com sucesso!")
    }
  }

  const handleSavePhone = () => {
    setWhatsappNumber(phoneInput)
    toast.success("Número do WhatsApp atualizado!")
  }

  const handleLogout = () => {
    logout()
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">
               <ArrowLeft className="h-5 w-5" />
             </Link>
            <h1 className="font-serif text-xl font-bold text-primary flex items-center gap-2">
              <Package className="h-5 w-5" /> Painel Administrativo
            </h1>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="text-destructive hover:text-destructive/90 hover:bg-destructive/10">
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="products" className="space-y-8">
          <TabsList>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Produtos</h2>
                <p className="text-muted-foreground">Gerencie o cardápio da confeitaria</p>
              </div>
              <Sheet open={isOpen} onOpenChange={(open) => {
                setIsOpen(open)
                if (!open) {
                  reset()
                  setEditingId(null)
                }
              }}>
                <SheetTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" /> Novo Produto
                  </Button>
                </SheetTrigger>
                <SheetContent className="overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{editingId ? "Editar Produto" : "Novo Produto"}</SheetTitle>
                  </SheetHeader>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-8">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input {...register("name")} placeholder="Ex: Bolo de Chocolate" />
                      {errors.name && (
                        <p className="text-sm text-destructive">{errors.name.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Preço (R$)</Label>
                      <Input
                        {...register("price")}
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                      />
                      {errors.price && (
                        <p className="text-sm text-destructive">{errors.price.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Select
                        onValueChange={(val) => setValue("category", val)}
                        defaultValue={editingId ? undefined : ""}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.category && (
                        <p className="text-sm text-destructive">
                          {errors.category.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Input
                        {...register("description")}
                        placeholder="Breve descrição do produto"
                      />
                      {errors.description && (
                        <p className="text-sm text-destructive">
                          {errors.description.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>URL da Imagem</Label>
                      <Input
                        {...register("image")}
                        placeholder="https://..."
                      />
                      {errors.image && (
                        <p className="text-sm text-destructive">{errors.image.message}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Dica: Use o gerador de imagens do Trae ou URLs externas.
                      </p>
                    </div>

                    <Button type="submit" className="w-full">
                      {editingId ? "Salvar Alterações" : "Criar Produto"}
                    </Button>
                  </form>
                </SheetContent>
              </Sheet>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Listagem ({products.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Imagem</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="relative h-10 w-10 rounded-md overflow-hidden bg-secondary/10">
                            {product.image && (product.image.startsWith("http") || product.image.startsWith("/")) ? (
                              <Image
                                src={product.image}
                                alt={product.name}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-primary/20">
                                <Package className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell>R$ {product.price.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(product)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(product.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" /> Configurações Gerais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-md">
                  <Label>Número do WhatsApp para Pedidos</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        value={phoneInput} 
                        onChange={(e) => setPhoneInput(e.target.value)} 
                        className="pl-9" 
                        placeholder="5511999999999"
                      />
                    </div>
                    <Button onClick={handleSavePhone}>Salvar</Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Formato internacional: Código do país + DDD + Número (apenas números). <br/>
                    Ex: 5511999999999
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
