
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
import { Plus, Trash2, Edit, LogOut, Package, ArrowLeft, Phone, ListOrdered, Text } from "lucide-react"
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
  const { products, categories, deleteProduct, addProduct, updateProduct } =
    useProductStore()
  const logout = useAuthStore((state) => state.logout)
  const {
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
    setAgentName,
    setAgentSubtitle,
    setAgentAvatarUrl,
    setAgentWelcomeMessage,
    setAgentInputPlaceholder,
    setAgentSource,
  } = useConfigStore()
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [phoneInput, setPhoneInput] = useState(whatsappNumber)
  const [localSectionsOrder, setLocalSectionsOrder] = useState(homeSectionsOrder)
  const [localHeroSlides, setLocalHeroSlides] = useState(heroSlides)
  const [localBenefits, setLocalBenefits] = useState(benefits)
  const [localTestimonials, setLocalTestimonials] = useState(testimonials)

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

  const moveSection = (index: number, direction: "up" | "down") => {
    const newOrder = [...localSectionsOrder]
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newOrder.length) return
    const temp = newOrder[index]
    newOrder[index] = newOrder[targetIndex]
    newOrder[targetIndex] = temp
    setLocalSectionsOrder(newOrder)
  }

  const saveSectionsOrder = () => {
    setHomeSectionsOrder(localSectionsOrder)
    toast.success("Ordem das seções atualizada!")
  }

  const saveHeroSlides = () => {
    setHeroSlides(localHeroSlides)
    toast.success("Banner atualizado!")
  }

  const saveBenefits = () => {
    setBenefits(localBenefits)
    toast.success("Benefícios atualizados!")
  }

  const saveTestimonials = () => {
    setTestimonials(localTestimonials)
    toast.success("Depoimentos atualizados!")
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
          <TabsList className="grid w-full grid-cols-3 max-w-[600px]">
            <TabsTrigger value="products">Produtos</TabsTrigger>
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
                    <Button onClick={handleSavePhone}>Salvar</Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Este número será usado em todos os botões de &quot;Encomendar&quot; do site.
                    Formato recomendado: 55 + DDD + Número (apenas números).
                  </p>
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
                <Button type="button" onClick={saveHeroSlides}>
                  Salvar banner
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
                <Button type="button" onClick={saveBenefits}>
                  Salvar benefícios
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
                <Button type="button" onClick={saveTestimonials}>
                  Salvar depoimentos
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
                <Button type="button" onClick={saveSectionsOrder}>
                  Salvar ordem
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
