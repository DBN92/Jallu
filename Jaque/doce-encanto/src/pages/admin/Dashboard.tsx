
import { useState, useEffect } from "react"
import { useProductStore } from "@/store/product-store"
import { useAuthStore } from "@/store/auth-store"
import { useConfigStore } from "@/store/config-store"
import { Product } from "@/data/products"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Plus, Trash2, Edit, LogOut, Package, ArrowLeft, Phone, ListOrdered, Text } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Link, useNavigate } from "react-router-dom"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useOrdersStore, type OrderStatus } from "@/store/orders-store"
import { workopsIngest } from "@/lib/workops-agent"

const productSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().min(1, "Descrição é obrigatória"),
  price: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Preço inválido"),
  category: z.string().min(1, "Categoria é obrigatória"),
  image: z.union([z.literal(""), z.string().url("URL inválida")]).optional(),
})

type ProductForm = z.infer<typeof productSchema>

const sectionLabels: Record<string, string> = {
  hero: "Banner principal",
  categories: "Categorias",
  benefits: "Benefícios",
  products: "Cardápio",
  testimonials: "Depoimentos",
  newsletter: "Newsletter",
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { products, categories, deleteProduct, addProduct, updateProduct, fetchProducts } =
    useProductStore()
  const logout = useAuthStore((state) => state.logout)
  const {
    fetchConfig,
    whatsappNumber,
    setWhatsappNumber,
    homeSectionsOrder,
    setHomeSectionsOrder,
    heroSlides,
    setHeroSlides,
    benefits,
    setBenefits,
    testimonials,
    setTestimonials,
    categoryTitle,
    categorySubtitle,
    setCategoryTitle,
    setCategorySubtitle,
    testimonialsTitle,
    testimonialsSubtitle,
    setTestimonialsTitle,
    setTestimonialsSubtitle,
    newsletterTitle,
    newsletterSubtitle,
    newsletterCta,
    newsletterDisclaimer,
    setNewsletterTitle,
    setNewsletterSubtitle,
    setNewsletterCta,
    setNewsletterDisclaimer,
    footerDescription,
    contactEmail,
    setFooterDescription,
    setContactEmail,
    agentName,
    agentSubtitle,
    agentAvatarUrl,
    agentWelcomeMessage,
    agentInputPlaceholder,
    agentSource,
    shippingFee,
    setAgentName,
    setAgentSubtitle,
    setAgentAvatarUrl,
    setAgentWelcomeMessage,
    setAgentInputPlaceholder,
    setAgentSource,
    setShippingFee,
    saveConfig,
  } = useConfigStore()
  const fetchOrders = useOrdersStore((state) => state.fetchOrders)
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [phoneInput, setPhoneInput] = useState(whatsappNumber)
  const [localSectionsOrder, setLocalSectionsOrder] = useState(homeSectionsOrder)
  const [localHeroSlides, setLocalHeroSlides] = useState(heroSlides)
  const [localBenefits, setLocalBenefits] = useState(benefits)
  const [localTestimonials, setLocalTestimonials] = useState(testimonials)

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchProducts(), fetchConfig(), fetchOrders()])
    }
    loadData()
  }, [fetchProducts, fetchConfig, fetchOrders])

  useEffect(() => {
    setPhoneInput(whatsappNumber)
  }, [whatsappNumber])

  useEffect(() => {
    setLocalSectionsOrder(homeSectionsOrder)
  }, [homeSectionsOrder])

  useEffect(() => {
    setLocalHeroSlides(heroSlides)
  }, [heroSlides])

  useEffect(() => {
    setLocalBenefits(benefits)
  }, [benefits])

  useEffect(() => {
    setLocalTestimonials(testimonials)
  }, [testimonials])

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
  })

  const onSubmit = async (data: ProductForm) => {
    setIsSubmitting(true)
    try {
      // Manually convert price to number for the store
      const payload = {
        ...data,
        category: data.category.trim(),
        price: parseFloat(data.price)
      } as unknown as Omit<Product, 'id'>

      if (editingId) {
        await updateProduct(editingId, payload)
        toast.success("Produto atualizado com sucesso!")
      } else {
        await addProduct(payload)
        toast.success("Produto criado com sucesso!")
      }
      setIsOpen(false)
      reset()
      setEditingId(null)
    } catch (error) {
      console.error(error)
      toast.error("Erro ao salvar produto. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
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

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este produto?")) {
      try {
        await deleteProduct(id)
        toast.success("Produto excluído com sucesso!")
      } catch (error) {
        console.error(error)
        toast.error("Erro ao excluir produto")
      }
    }
  }

  const handleLogout = () => {
    logout()
    navigate("/admin/login")
  }

  const handleSavePhone = async () => {
    if (phoneInput.trim().length < 10) {
      toast.error("Número de telefone inválido")
      return
    }
    setIsSubmitting(true)
    try {
      setWhatsappNumber(phoneInput)
      await saveConfig()
      toast.success("Número do WhatsApp atualizado!")
    } catch (error) {
      console.error(error)
      toast.error("Erro ao salvar WhatsApp")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsSubmitting(true)
    try {
      await saveConfig()
      toast.success("Configurações salvas!")
    } catch (error) {
      console.error(error)
      toast.error("Erro ao salvar configurações")
    } finally {
      setIsSubmitting(false)
    }
  }

  const moveSection = (index: number, direction: "up" | "down") => {
    const newOrder = [...localSectionsOrder]
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newOrder.length) return
    const temp = newOrder[index]
    newOrder[index] = newOrder[targetIndex]
    newOrder[targetIndex] = temp
    setLocalSectionsOrder(newOrder)
  }

  const saveSectionsOrder = async () => {
    setIsSubmitting(true)
    try {
      setHomeSectionsOrder(localSectionsOrder)
      await saveConfig()
      toast.success("Ordem das seções atualizada!")
    } catch (error) {
      console.error(error)
      toast.error("Erro ao salvar ordem")
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveHeroSlides = async () => {
    setIsSubmitting(true)
    try {
      setHeroSlides(localHeroSlides)
      await saveConfig()
      toast.success("Banner atualizado!")
    } catch (error) {
      console.error(error)
      toast.error("Erro ao salvar banner")
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveBenefits = async () => {
    setIsSubmitting(true)
    try {
      setBenefits(localBenefits)
      await saveConfig()
      toast.success("Benefícios atualizados!")
    } catch (error) {
      console.error(error)
      toast.error("Erro ao salvar benefícios")
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveTestimonials = async () => {
    setIsSubmitting(true)
    try {
      setTestimonials(localTestimonials)
      await saveConfig()
      toast.success("Depoimentos atualizados!")
    } catch (error) {
      console.error(error)
      toast.error("Erro ao salvar depoimentos")
    } finally {
      setIsSubmitting(false)
    }
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
          <TabsList className="grid w-full grid-cols-4 max-w-[800px]">
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="orders">Pedidos</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
            <TabsTrigger value="content">Conteúdo</TabsTrigger>
          </TabsList>
          
          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Gerenciar Produtos</h2>
                <p className="text-muted-foreground">
                  Adicione, edite ou remova produtos do catálogo
                </p>
              </div>
              <Sheet open={isOpen} onOpenChange={(open: boolean) => {
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
                            <SelectItem key={cat} value={cat}>
                              {cat}
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

                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Salvando..." : editingId ? "Salvar Alterações" : "Adicionar Produto"}
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
                          {product.category}
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

          <TabsContent value="orders" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Pedidos</h2>
                <p className="text-muted-foreground">
                  Acompanhe e atualize o status dos pedidos
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Visão geral
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OrdersAdminStats />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Lista de pedidos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <OrdersAdminTable />
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhoneInput(e.target.value)}
                    />
                    <Button onClick={handleSavePhone} disabled={isSubmitting}>
                      {isSubmitting ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Este número será usado em todos os botões de &quot;Encomendar&quot; do site.
                    Formato recomendado: 55 + DDD + Número (apenas números).
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Frete padrão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-w-sm">
                <Label htmlFor="shippingFee">Valor do frete (R$)</Label>
                <Input
                  id="shippingFee"
                  type="number"
                  min={0}
                  step={1}
                  value={shippingFee}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setShippingFee(Number(event.target.value) || 0)
                  }
                />
                <div className="pt-2">
                  <Button type="button" onClick={handleSaveSettings} disabled={isSubmitting}>
                    {isSubmitting ? "Salvando..." : "Salvar configurações"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Gestão de Conteúdo</h2>
                <p className="text-muted-foreground">
                  Personalize textos, imagens e ordem das seções do site
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Text className="h-5 w-5" />
                  Textos principais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="categoryTitle">Título de categorias</Label>
                    <Input
                      id="categoryTitle"
                      value={categoryTitle}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setCategoryTitle(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categorySubtitle">Descrição de categorias</Label>
                    <Input
                      id="categorySubtitle"
                      value={categorySubtitle}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setCategorySubtitle(event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="testimonialsTitle">Título de depoimentos</Label>
                    <Input
                      id="testimonialsTitle"
                      value={testimonialsTitle}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setTestimonialsTitle(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="testimonialsSubtitle">Descrição de depoimentos</Label>
                    <Input
                      id="testimonialsSubtitle"
                      value={testimonialsSubtitle}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setTestimonialsSubtitle(event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="newsletterTitle">Título da newsletter</Label>
                    <Input
                      id="newsletterTitle"
                      value={newsletterTitle}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setNewsletterTitle(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newsletterSubtitle">Descrição da newsletter</Label>
                    <Input
                      id="newsletterSubtitle"
                      value={newsletterSubtitle}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setNewsletterSubtitle(event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="newsletterCta">Texto do botão da newsletter</Label>
                    <Input
                      id="newsletterCta"
                      value={newsletterCta}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setNewsletterCta(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newsletterDisclaimer">Aviso da newsletter</Label>
                    <Input
                      id="newsletterDisclaimer"
                      value={newsletterDisclaimer}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setNewsletterDisclaimer(event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="footerDescription">Texto do rodapé</Label>
                    <Input
                      id="footerDescription"
                      value={footerDescription}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setFooterDescription(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">E-mail de contato</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={contactEmail}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setContactEmail(event.target.value)
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Text className="h-5 w-5" />
                  Agente virtual (chat)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agentName">Nome exibido</Label>
                    <Input
                      id="agentName"
                      value={agentName}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setAgentName(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agentSubtitle">Subtítulo</Label>
                    <Input
                      id="agentSubtitle"
                      value={agentSubtitle}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setAgentSubtitle(event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agentAvatarUrl">URL do avatar</Label>
                    <Input
                      id="agentAvatarUrl"
                      value={agentAvatarUrl}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setAgentAvatarUrl(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agentSource">Identificador de origem (enviado ao WorkOps)</Label>
                    <Input
                      id="agentSource"
                      value={agentSource}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setAgentSource(event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agentWelcomeMessage">Mensagem de boas-vindas</Label>
                  <Input
                    id="agentWelcomeMessage"
                    value={agentWelcomeMessage}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setAgentWelcomeMessage(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agentInputPlaceholder">Placeholder do campo de mensagem</Label>
                  <Input
                    id="agentInputPlaceholder"
                    value={agentInputPlaceholder}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setAgentInputPlaceholder(event.target.value)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Text className="h-5 w-5" />
                  Banner principal (hero)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {localHeroSlides.map((slide, index) => (
                  <div key={index} className="space-y-4 rounded-lg border bg-background p-4">
                    <p className="text-sm font-medium">Slide {index + 1}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`heroTitle-${index}`}>Título</Label>
                        <Input
                          id={`heroTitle-${index}`}
                          value={slide.title}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const updated = [...localHeroSlides]
                            updated[index] = { ...updated[index], title: event.target.value }
                            setLocalHeroSlides(updated)
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`heroHighlight-${index}`}>Palavra em destaque</Label>
                        <Input
                          id={`heroHighlight-${index}`}
                          value={slide.highlight}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const updated = [...localHeroSlides]
                            updated[index] = { ...updated[index], highlight: event.target.value }
                            setLocalHeroSlides(updated)
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`heroTitleEnd-${index}`}>Final do título</Label>
                        <Input
                          id={`heroTitleEnd-${index}`}
                          value={slide.titleEnd}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const updated = [...localHeroSlides]
                            updated[index] = { ...updated[index], titleEnd: event.target.value }
                            setLocalHeroSlides(updated)
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`heroCta-${index}`}>Texto do botão principal</Label>
                        <Input
                          id={`heroCta-${index}`}
                          value={slide.cta}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const updated = [...localHeroSlides]
                            updated[index] = { ...updated[index], cta: event.target.value }
                            setLocalHeroSlides(updated)
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`heroDescription-${index}`}>Descrição</Label>
                      <Input
                        id={`heroDescription-${index}`}
                        value={slide.description}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          const updated = [...localHeroSlides]
                          updated[index] = { ...updated[index], description: event.target.value }
                          setLocalHeroSlides(updated)
                        }}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`heroLink-${index}`}>Link do botão (hash ou whatsapp)</Label>
                        <Input
                          id={`heroLink-${index}`}
                          value={slide.link}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const updated = [...localHeroSlides]
                            updated[index] = { ...updated[index], link: event.target.value }
                            setLocalHeroSlides(updated)
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`heroImage-${index}`}>URL da imagem de fundo</Label>
                        <Input
                          id={`heroImage-${index}`}
                          value={slide.image}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const updated = [...localHeroSlides]
                            updated[index] = { ...updated[index], image: event.target.value }
                            setLocalHeroSlides(updated)
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="button" onClick={saveHeroSlides} disabled={isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Salvar banner"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Text className="h-5 w-5" />
                  Benefícios
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {localBenefits.map((benefit, index) => (
                  <div key={index} className="space-y-3 rounded-lg border bg-background p-4">
                    <p className="text-sm font-medium">Benefício {index + 1}</p>
                    <div className="space-y-2">
                      <Label htmlFor={`benefitTitle-${index}`}>Título</Label>
                      <Input
                        id={`benefitTitle-${index}`}
                        value={benefit.title}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          const updated = [...localBenefits]
                          updated[index] = { ...updated[index], title: event.target.value }
                          setLocalBenefits(updated)
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`benefitDescription-${index}`}>Descrição</Label>
                      <Input
                        id={`benefitDescription-${index}`}
                        value={benefit.description}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          const updated = [...localBenefits]
                          updated[index] = { ...updated[index], description: event.target.value }
                          setLocalBenefits(updated)
                        }}
                      />
                    </div>
                  </div>
                ))}
                <Button type="button" onClick={saveBenefits} disabled={isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Salvar benefícios"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Text className="h-5 w-5" />
                  Depoimentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {localTestimonials.map((testimonial, index) => (
                  <div key={index} className="space-y-3 rounded-lg border bg-background p-4">
                    <p className="text-sm font-medium">Depoimento {index + 1}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`testimonialName-${index}`}>Nome</Label>
                        <Input
                          id={`testimonialName-${index}`}
                          value={testimonial.name}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const updated = [...localTestimonials]
                            updated[index] = { ...updated[index], name: event.target.value }
                            setLocalTestimonials(updated)
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`testimonialStars-${index}`}>Estrelas (1 a 5)</Label>
                        <Input
                          id={`testimonialStars-${index}`}
                          type="number"
                          min={1}
                          max={5}
                          value={testimonial.stars}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                            const value = Number(event.target.value)
                            const stars = isNaN(value) ? 5 : Math.min(5, Math.max(1, value))
                            const updated = [...localTestimonials]
                            updated[index] = { ...updated[index], stars }
                            setLocalTestimonials(updated)
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`testimonialComment-${index}`}>Comentário</Label>
                      <Input
                        id={`testimonialComment-${index}`}
                        value={testimonial.comment}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                          const updated = [...localTestimonials]
                          updated[index] = { ...updated[index], comment: event.target.value }
                          setLocalTestimonials(updated)
                        }}
                      />
                    </div>
                  </div>
                ))}
                <Button type="button" onClick={saveTestimonials} disabled={isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Salvar depoimentos"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListOrdered className="h-5 w-5" />
                  Ordem das seções da página inicial
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {localSectionsOrder.map((section, index) => (
                    <div
                      key={section}
                      className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                    >
                      <span className="text-sm font-medium">
                        {index + 1}. {sectionLabels[section] ?? section}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={index === 0}
                          onClick={() => moveSection(index, "up")}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={index === localSectionsOrder.length - 1}
                          onClick={() => moveSection(index, "down")}
                        >
                          ↓
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" onClick={saveSectionsOrder} disabled={isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Salvar ordem"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function OrdersAdminStats() {
  const orders = useOrdersStore((s) => s.orders)
  const totalOrders = orders.length
  const statusCount = orders.reduce<Record<OrderStatus, number>>((acc, o) => {
    const st = (o.status ?? "pending") as OrderStatus
    acc[st] = (acc[st] ?? 0) + 1
    return acc
  }, { pending: 0, accepted: 0, rejected: 0, processing: 0, completed: 0, unknown: 0 })
  const revenue = orders
    .filter((o) => ["accepted", "processing", "completed"].includes(String(o.status ?? "")))
    .reduce((sum, o) => sum + (o.total ?? 0), 0)
  const cancelled = statusCount.rejected ?? 0
  const cancellationRate = totalOrders > 0 ? Math.round((cancelled / totalOrders) * 100) : 0
  const pending = statusCount.pending ?? 0
  const asCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
  const pct = (count: number) => (totalOrders > 0 ? Math.max(4, Math.round((count / totalOrders) * 100)) : 0)
  const nowTs = new Date().getTime()
  const pendingAgesMs = orders
    .filter((o) => (o.status ?? "pending") === "pending")
    .map((o) => {
      const t = o.createdAt ? new Date(o.createdAt).getTime() : nowTs
      return nowTs - t
    })
  const avgPendingMs = pendingAgesMs.length ? Math.round(pendingAgesMs.reduce((a, b) => a + b, 0) / pendingAgesMs.length) : 0
  const avgPendingHours = avgPendingMs ? Math.max(0, Math.round(avgPendingMs / 36e5)) : 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Pedidos</p>
          <p className="text-2xl font-semibold">{totalOrders}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Receita (aceitos+)</p>
          <p className="text-2xl font-semibold">{asCurrency(revenue)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Taxa de cancelamento</p>
          <p className="text-2xl font-semibold">{cancellationRate}%</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Pendentes</p>
          <p className="text-2xl font-semibold">{pending}</p>
        </div>
        <div className="rounded-lg border p-4 md:col-span-2">
          <p className="text-xs text-muted-foreground">Tempo médio em pendente</p>
          <p className="text-2xl font-semibold">{avgPendingHours}h</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm font-medium">Distribuição por status</p>
          <div className="text-xs">
            Pendente ({statusCount.pending ?? 0})
            <div className="h-2 w-full rounded bg-muted">
              <div className="h-2 rounded bg-primary" style={{ width: `${pct(statusCount.pending ?? 0)}%` }} />
            </div>
          </div>
          <div className="text-xs">
            Aceito ({statusCount.accepted ?? 0})
            <div className="h-2 w-full rounded bg-muted">
              <div className="h-2 rounded bg-primary" style={{ width: `${pct(statusCount.accepted ?? 0)}%` }} />
            </div>
          </div>
          <div className="text-xs">
            Em preparação ({statusCount.processing ?? 0})
            <div className="h-2 w-full rounded bg-muted">
              <div className="h-2 rounded bg-primary" style={{ width: `${pct(statusCount.processing ?? 0)}%` }} />
            </div>
          </div>
          <div className="text-xs">
            Concluído ({statusCount.completed ?? 0})
            <div className="h-2 w-full rounded bg-muted">
              <div className="h-2 rounded bg-primary" style={{ width: `${pct(statusCount.completed ?? 0)}%` }} />
            </div>
          </div>
          <div className="text-xs">
            Rejeitado ({statusCount.rejected ?? 0})
            <div className="h-2 w-full rounded bg-muted">
              <div className="h-2 rounded bg-primary" style={{ width: `${pct(statusCount.rejected ?? 0)}%` }} />
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm font-medium">Atalhos</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Voltar ao topo</Button>
            <Button variant="outline" size="sm" onClick={() => document.querySelector('[data-orders-list]')?.scrollIntoView({ behavior: "smooth" })}>Ir para lista</Button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Pedidos por dia (14 dias)</p>
          {(() => {
            const days = 14
            const dayMs = 86400000
            const now = new Date()
            const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
            const buckets = Array.from({ length: days }).map((_, i) => base - (days - 1 - i) * dayMs)
            const counts = buckets.map((t) => {
              const d = new Date(t).toISOString().slice(0, 10)
              return orders.filter((o) => (o.createdAt ?? "").slice(0, 10) === d).length
            })
            const maxV = Math.max(1, ...counts)
            const w = 600
            const h = 160
            const pad = 24
            const sx = (i: number) => pad + (i / (days - 1)) * (w - pad * 2)
            const sy = (v: number) => h - pad - (v / maxV) * (h - pad * 2)
            const pts = counts.map((v, i) => `${sx(i)},${sy(v)}`).join(" ")
            const bars = counts.map((v, i) => {
              const x = sx(i) - 6
              const y = sy(v)
              const bh = h - pad - y
              return { x, y, bh }
            })
            return (
              <div className="w-full overflow-x-auto">
                <svg width={w} height={h} className="max-w-full">
                  <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" className="text-muted-foreground/30" />
                  <polyline points={pts} fill="none" stroke="currentColor" className="text-primary" strokeWidth={2} />
                  {bars.map((b, i) => (
                    <rect key={i} x={b.x} y={b.y} width={12} height={b.bh} className="fill-primary/20" />
                  ))}
                </svg>
              </div>
            )
          })()}
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Receita por dia (14 dias)</p>
          {(() => {
            const days = 14
            const dayMs = 86400000
            const now = new Date()
            const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
            const buckets = Array.from({ length: days }).map((_, i) => base - (days - 1 - i) * dayMs)
            const totals = buckets.map((t) => {
              const d = new Date(t).toISOString().slice(0, 10)
              return orders
                .filter((o) => (o.createdAt ?? "").slice(0, 10) === d)
                .reduce((sum, o) => sum + (o.total ?? 0), 0)
            })
            const maxV = Math.max(1, ...totals)
            const w = 600
            const h = 160
            const pad = 24
            const sx = (i: number) => pad + (i / (days - 1)) * (w - pad * 2)
            const sy = (v: number) => h - pad - (v / maxV) * (h - pad * 2)
            const pts = totals.map((v, i) => `${sx(i)},${sy(v)}`).join(" ")
            return (
              <div className="w-full overflow-x-auto">
                <svg width={w} height={h} className="max-w-full">
                  <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" className="text-muted-foreground/30" />
                  <polyline points={pts} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2} />
                  {totals.map((v, i) => {
                    const x = sx(i) - 6
                    const y = sy(v)
                    const bh = h - pad - y
                    return <rect key={i} x={x} y={y} width={12} height={bh} className="fill-accent/20" />
                  })}
                </svg>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

function OrdersAdminTable() {
  const orders = useOrdersStore((s) => s.orders)
  const updateOrderStatus = useOrdersStore((s) => s.updateOrderStatus)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all")
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pix" | "cartao" | "dinheiro">("all")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "value_desc">("newest")
  const whatsappNumber = useConfigStore((s) => s.whatsappNumber)
  const [open, setOpen] = useState(false)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const onChangeStatus = async (idOrCodigo: string, status: OrderStatus) => {
    updateOrderStatus(idOrCodigo, status)
    toast.success("Status atualizado")
    try {
      await workopsIngest("order_status_admin_update", { code: idOrCodigo, status }, undefined, idOrCodigo)
    } catch {
    }
  }
  const selectedOrder = orders.find((o) => String(o.codigo ?? o.id ?? "") === selectedCode)
  const filtered = orders.filter((o) => {
    const code = String(o.codigo ?? o.id ?? "").toLowerCase()
    const matchCode = query.trim() ? code.includes(query.trim().toLowerCase()) : true
    const matchStatus = statusFilter === "all" ? true : (o.status ?? "pending") === statusFilter
    const pm = (o.paymentMethod ?? "").toString().toLowerCase()
    const matchPayment =
      paymentFilter === "all"
        ? true
        : paymentFilter === "pix"
        ? pm.includes("pix")
        : paymentFilter === "cartao"
        ? pm.includes("cart") || pm.includes("cartão")
        : pm.includes("dinheiro") || pm.includes("cash")
    const t = o.createdAt ? new Date(o.createdAt).getTime() : null
    const fromOk = dateFrom ? (t ? t >= new Date(dateFrom).getTime() : false) : true
    const toOk = dateTo ? (t ? t <= new Date(dateTo + "T23:59:59").getTime() : false) : true
    return matchCode && matchStatus && matchPayment && fromOk && toOk
  })
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "value_desc") {
      const av = a.total ?? 0
      const bv = b.total ?? 0
      return bv - av
    }
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return sortBy === "newest" ? bt - at : at - bt
  })
  const buildWhatsAppMessage = (order: { codigo?: string | null; id?: string | null; status?: OrderStatus; items?: { name?: string | null; quantity?: number | null; price?: number | null }[]; total?: number | null; payment_link?: string | null; customerName?: string | null }) => {
    const code = String(order.codigo ?? order.id ?? "")
    const greetName = order.customerName ? `Olá, ${order.customerName}!` : "Olá!"
    const header = `${greetName} Aqui é a Jallu Confeitaria. Seguem os detalhes do seu pedido ${code}:`
    const itemsLines = (order.items ?? [])
      .map((it) => {
        const q = it.quantity ?? 1
        const nm = it.name ?? "Item"
        const price = typeof it.price === "number" ? it.price : undefined
        const subtotal = price != null ? q * price : undefined
        const priceStr = subtotal != null ? ` — ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(subtotal)}` : ""
        return `• ${q}x ${nm}${priceStr}`
      })
      .join("\n")
    const totalLine =
      typeof order.total === "number"
        ? `Total: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(order.total)}`
        : ""
    const trackUrl = `${window.location.origin}/orders?code=${encodeURIComponent(code)}`
    const byStatus: Record<OrderStatus, string> = {
      pending: "Recebemos seu pedido e estamos analisando.",
      accepted: "Seu pedido foi aceito e entra em preparação em breve.",
      rejected: "Infelizmente não conseguimos atender ao seu pedido agora.",
      processing: "Seu pedido está em preparação.",
      completed: "Seu pedido foi concluído. Obrigado!",
      unknown: "Atualização do seu pedido.",
    }
    const statusText = byStatus[order.status ?? "pending"]
    const payment = order.payment_link ? `Pagamento: ${order.payment_link}` : ""
    const cleanShop = (whatsappNumber ?? "").replace(/\D+/g, "")
    const replyAccept = `https://wa.me/${cleanShop}?text=${encodeURIComponent(`Confirmo meu pedido ${code}`)}`
    const replyQuestion = `https://wa.me/${cleanShop}?text=${encodeURIComponent(`Tenho uma dúvida sobre o pedido ${code}`)}`
    const replyCancel = `https://wa.me/${cleanShop}?text=${encodeURIComponent(`Quero cancelar o pedido ${code}`)}`
    const quickReplies = `Respostas rápidas:\n- Confirmar: ${replyAccept}\n- Tirar dúvida: ${replyQuestion}\n- Cancelar: ${replyCancel}`
    return [header, itemsLines, totalLine, statusText, `Acompanhe: ${trackUrl}`, payment, quickReplies].filter(Boolean).join("\n")
  }
  const openWhatsApp = (phone: string, message: string) => {
    const clean = phone.replace(/\D+/g, "")
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank", "noopener")
  }
  const buildTimeline = (status: OrderStatus | undefined) => {
    const steps: { key: OrderStatus; label: string }[] = [
      { key: "pending", label: "Recebido" },
      { key: "accepted", label: "Aceito" },
      { key: "processing", label: "Em preparação" },
      { key: "completed", label: "Concluído" },
    ]
    if (status === "rejected") {
      return [
        { key: "pending", label: "Recebido" },
        { key: "rejected", label: "Rejeitado" },
      ]
    }
    return steps
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-4">
        <div className="flex gap-2 w-full">
          <Input
            placeholder="Buscar por código"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-full">
          <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v === "all" ? "all" : (v as OrderStatus))}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="accepted">Aceito</SelectItem>
              <SelectItem value="rejected">Rejeitado</SelectItem>
              <SelectItem value="processing">Em preparação</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full">
          <Select value={paymentFilter} onValueChange={(v: string) => setPaymentFilter(v as "all" | "pix" | "cartao" | "dinheiro")}>
            <SelectTrigger>
              <SelectValue placeholder="Forma de pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pix">Pix</SelectItem>
              <SelectItem value="cartao">Cartão</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <div className="w-full">
          <Select value={sortBy} onValueChange={(v: string) => setSortBy(v as "newest" | "oldest" | "value_desc")}>
            <SelectTrigger>
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mais recentes</SelectItem>
              <SelectItem value="oldest">Mais antigos</SelectItem>
              <SelectItem value="value_desc">Maior valor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full">
          <Button
            variant="outline"
            onClick={() => {
              const rows = sorted.map((o) => ({
                codigo: String(o.codigo ?? o.id ?? ""),
                criado_em: o.createdAt ?? "",
                status: o.status ?? "",
                cliente: o.customerName ?? "",
                telefone: o.customerPhone ?? "",
                pagamento: o.paymentMethod ?? "",
                entrega_retirada: o.fulfillment ?? "",
                total: typeof o.total === "number" ? o.total.toFixed(2) : "",
              }))
              const header = ["codigo","criado_em","status","cliente","telefone","pagamento","entrega_retirada","total"]
              const csv = [header.join(";")]
                .concat(
                  rows.map((r) => header.map((h) => String((r as Record<string,string>)[h] ?? "")).join(";"))
                )
                .join("\n")
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = "pedidos.csv"
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Exportar CSV
          </Button>
        </div>
      </div>
      <Table data-orders-list="true">
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((o) => {
            const code = String(o.codigo ?? o.id ?? "")
            return (
              <TableRow key={code}>
                <TableCell className="font-mono">{code}</TableCell>
                <TableCell>{o.createdAt ? new Date(o.createdAt).toLocaleString("pt-BR") : "-"}</TableCell>
                <TableCell className="max-w-[220px]">
                  <Select defaultValue={o.status ?? "pending"} onValueChange={(val) => onChangeStatus(code, val as OrderStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="accepted">Aceito</SelectItem>
                      <SelectItem value="rejected">Rejeitado</SelectItem>
                      <SelectItem value="processing">Em preparação</SelectItem>
                      <SelectItem value="completed">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const targetPhone = o.customerPhone ?? prompt("Informe o WhatsApp do cliente (ex.: 5511999999999)") ?? ""
                        if (!targetPhone.trim()) return
                        const msg = buildWhatsAppMessage(o)
                        openWhatsApp(targetPhone, msg)
                      }}
                    >
                      WhatsApp
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSelectedCode(code)
                        setOpen(true)
                      }}
                    >
                      Detalhes
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-sm py-6 text-center">Nenhum pedido encontrado.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[540px] sm:w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes do pedido</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            {!selectedOrder ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido selecionado.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Código</p>
                    <p className="font-mono">{selectedOrder.codigo ?? selectedOrder.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Criado em</p>
                    <p>{selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString("pt-BR") : "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cliente</p>
                    <p>{selectedOrder.customerName ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Telefone</p>
                    <p>{selectedOrder.customerPhone ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Forma de pagamento</p>
                    <div>
                      {selectedOrder.paymentMethod ? (
                        <Badge variant="secondary">{selectedOrder.paymentMethod}</Badge>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Entrega/retirada</p>
                    <div>
                      {selectedOrder.fulfillment ? (
                        <Badge variant="outline">{selectedOrder.fulfillment === "delivery" ? "Entrega" : "Retirada"}</Badge>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  </div>
                  {selectedOrder.fulfillment === "delivery" && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Endereço de entrega</p>
                      <p className="text-sm">
                        {selectedOrder.addressLine ||
                          [
                            selectedOrder.zipCode ? `CEP: ${selectedOrder.zipCode}` : "",
                            selectedOrder.addressNumber ? `Número: ${selectedOrder.addressNumber}` : "",
                          ]
                            .filter(Boolean)
                            .join(" • ") ||
                          "Endereço não informado"}
                      </p>
                      {typeof selectedOrder.shippingFee === "number" && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Frete:{" "}
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(selectedOrder.shippingFee)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-xs font-medium text-foreground mb-1">Linha do tempo</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {buildTimeline(selectedOrder.status).map((step, index, all) => {
                      const currentStatus = selectedOrder.status ?? "pending"
                      const currentIndex = all.findIndex((s) => s.key === currentStatus)
                      const isDone = currentIndex > index
                      const isCurrent = currentIndex === index
                      const isFuture = currentIndex < index
                      return (
                        <div key={step.key} className="flex items-center gap-2 text-[11px]">
                          <div
                            className={
                              isDone
                                ? "h-5 w-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px]"
                                : isCurrent
                                ? "h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]"
                                : "h-5 w-5 rounded-full border border-muted-foreground/40 text-muted-foreground flex items-center justify-center text-[10px]"
                            }
                          >
                            {index + 1}
                          </div>
                          <span
                            className={
                              isDone
                                ? "text-[11px] text-foreground"
                                : isCurrent
                                ? "text-[11px] text-foreground font-medium"
                                : "text-[11px] text-muted-foreground"
                            }
                          >
                            {step.label}
                          </span>
                          {index < all.length - 1 && (
                            <div
                              className={
                                isFuture ? "h-px w-5 bg-muted-foreground/30" : "h-px w-5 bg-primary"
                              }
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Itens</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="w-20">Qtde</TableHead>
                        <TableHead className="w-28 text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedOrder.items ?? []).map((it, idx) => {
                        const q = it.quantity ?? 1
                        const price = it.price ?? 0
                        const subtotal = q * price
                        return (
                          <TableRow key={`${it.id ?? idx}`}>
                            <TableCell>{it.name ?? "Item"}</TableCell>
                            <TableCell>{q}</TableCell>
                            <TableCell className="text-right">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(subtotal)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between border-t pt-2 text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">
                      {typeof selectedOrder.total === "number"
                        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedOrder.total)
                        : "—"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => selectedOrder && onChangeStatus(String(selectedOrder.codigo ?? selectedOrder.id), "rejected")}
                  >
                    Rejeitar
                  </Button>
                  <Button
                    onClick={() => selectedOrder && onChangeStatus(String(selectedOrder.codigo ?? selectedOrder.id), "accepted")}
                  >
                    Aprovar
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
