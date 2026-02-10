
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useProductStore } from "@/store/product-store"
import { useCartStore } from "@/store/cart-store"
import { ShoppingBag } from "lucide-react"

export function ProductGrid() {
  const [selectedCategory, setSelectedCategory] = useState("Todos")
  const { addItem } = useCartStore()
  const { products, categories } = useProductStore()

  const filteredProducts =
    selectedCategory === "Todos"
      ? products
      : products.filter((p) => p.category === selectedCategory)

  return (
    <section id="menu" className="py-24 bg-muted/20 relative">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30 pointer-events-none" />
      
      <div className="container mx-auto px-4 relative">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <h2 className="font-serif text-4xl font-bold text-primary sm:text-5xl mb-4">
            Destaques do Cardápio
          </h2>
          <p className="text-lg text-muted-foreground">
            Escolha suas delícias favoritas entre nossas criações artesanais
          </p>
        </div>

        <Tabs
          defaultValue="Todos"
          className="mb-16 flex flex-col items-center"
          onValueChange={setSelectedCategory}
        >
          <TabsList className="h-auto flex-wrap gap-2 bg-transparent p-0">
            <TabsTrigger
              value="Todos"
              className="rounded-full border border-primary/10 bg-white/50 px-8 py-3 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-sm hover:bg-white transition-all"
            >
              Todos
            </TabsTrigger>
            {categories.map((category) => (
              <TabsTrigger
                key={category}
                value={category}
                className="rounded-full border border-primary/10 bg-white/50 px-8 py-3 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-sm hover:bg-white transition-all"
              >
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <motion.div
          layout
          className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <AnimatePresence>
            {filteredProducts.map((product) => (
              <motion.div
                key={product.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="group h-full overflow-hidden border-none bg-white shadow-sm hover:shadow-xl transition-all duration-300 rounded-3xl">
                  <div className="relative aspect-square overflow-hidden bg-secondary/10">
                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                    {product.image && (product.image.startsWith("http") || product.image.startsWith("/")) ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-primary/20">
                        <ShoppingBag className="h-16 w-16" />
                      </div>
                    )}
                    <div className="absolute bottom-4 right-4 z-20 translate-y-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                      <Button
                        size="icon"
                        className="h-12 w-12 rounded-full bg-white text-primary hover:bg-white/90 shadow-lg"
                        onClick={() => addItem(product)}
                      >
                         <ShoppingBag className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                  <CardHeader className="p-6 pb-2">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                         <p className="text-xs font-bold text-accent uppercase tracking-wider mb-1">{product.category}</p>
                         <h3 className="font-serif text-xl font-bold text-foreground group-hover:text-primary transition-colors">{product.name}</h3>
                      </div>
                      <p className="font-bold text-lg text-primary whitespace-nowrap">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(product.price)}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="px-6 pb-6">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}
