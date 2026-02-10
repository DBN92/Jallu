
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
import { Link, useNavigate } from "react-router-dom"
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
  const navigate = useNavigate()
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

  const handleLogout = () => {
    logout()
    navigate("/admin/login")
  }

  const handleSavePhone = () => {
    if (phoneInput.trim().length < 10) {
      toast.error("Número de telefone inválido")
      return
    }
    setWhatsappNumber(phoneInput)
    toast.success("Número do WhatsApp atualizado!")
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-serif font-bold text-primary flex items-center gap-2">
            <Package className="h-6 w-6" />
            Painel Administrativo
          </h1>
        </div>
        <Button variant="ghost" className="text-destructive hover:text-destructive/90 hover:bg-destructive/10" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-8">
        <Tabs defaultValue="products" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>
          
          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Gerenciar Produtos</h2>
                <p className="text-muted-foreground">
                  Adicione, edite ou remova produtos do catálogo
                </p>
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
                    <Plus className="h-4 w-4" />
                    Novo Produto
                  </Button>
                </SheetTrigger>
                <SheetContent className="overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{editingId ? "Editar Produto" : "Novo Produto"}</SheetTitle>
                  </SheetHeader>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome do Produto</Label>
                      <Input id="name" {...register("name")} placeholder="Ex: Bolo de Chocolate" />
                      {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="category">Categoria</Label>
                      <Select 
                        onValueChange={(val) => setValue("category", val)} 
                        defaultValue={editingId ? undefined : ""}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="price">Preço (R$)</Label>
                      <Input 
                        id="price" 
                        type="number" 
                        step="0.01" 
                        {...register("price")} 
                        placeholder="0.00" 
                      />
                      {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Descrição</Label>
                      <Input 
                        id="description" 
                        {...register("description")} 
                        placeholder="Breve descrição do produto" 
                      />
                      {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="image">URL da Imagem</Label>
                      <Input 
                        id="image" 
                        {...register("image")} 
                        placeholder="https://..." 
                      />
                      {errors.image && <p className="text-sm text-destructive">{errors.image.message}</p>}
                    </div>

                    <Button type="submit" className="w-full">
                      {editingId ? "Salvar Alterações" : "Adicionar Produto"}
                    </Button>
                  </form>
                </SheetContent>
              </Sheet>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Imagem</TableHead>
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
                          <div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name}
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground">
                                <Package className="h-6 w-6" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          {categories.find(c => c.id === product.category)?.name || product.category}
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          }).format(product.price)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleEdit(product)}
                            >
                              <Edit className="h-4 w-4 text-primary" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleDelete(product.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {products.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhum produto cadastrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Configurações Gerais</h2>
                <p className="text-muted-foreground">
                  Gerencie as configurações globais do site
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Contato do WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                  <Label htmlFor="whatsapp">Número do WhatsApp (com DDD)</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="whatsapp" 
                      type="tel" 
                      placeholder="5511999999999"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                    />
                    <Button onClick={handleSavePhone}>Salvar</Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Este número será usado em todos os botões de "Encomendar" do site.
                    Formato recomendado: 55 + DDD + Número (apenas números).
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
