
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, ChevronLeft, ChevronRight, Star, Clock, Heart } from "lucide-react"
import { useConfigStore } from "@/store/config-store"
import { cn } from "@/lib/utils"

const baseSlides = [
  {
    id: 1,
    title: "Doces que transformam ",
    highlight: "momentos",
    titleEnd: " em memória.",
    description: "Experimente o sabor inesquecível de nossos bolos e doces feitos com ingredientes selecionados, técnica refinada e muito amor.",
    image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=80",
    cta: "Ver cardápio",
    link: "#menu",
    badge: { icon: Clock, label: "Entrega", value: "Rápida" },
    badge2: { icon: Star, label: "Avaliação", value: "4.9" }
  },
  {
    id: 2,
    title: "Bolos artísticos para ",
    highlight: "celebrar",
    titleEnd: " a vida.",
    description: "Cada detalhe é pensado para tornar sua festa única. Personalização exclusiva para casamentos, aniversários e eventos.",
    image: "https://images.unsplash.com/photo-1535254973040-607b474cb50d?auto=format&fit=crop&w=1200&q=80",
    cta: "Fazer encomenda",
    link: "whatsapp",
    badge: { icon: Heart, label: "Feito com", value: "Amor" },
    badge2: { icon: Star, label: "Qualidade", value: "Premium" }
  },
  {
    id: 3,
    title: "O verdadeiro sabor da ",
    highlight: "felicidade",
    titleEnd: ".",
    description: "Doces finos, sobremesas gourmet e chocolates artesanais que derretem na boca e aquecem o coração.",
    image: "https://images.unsplash.com/photo-1488477181946-6428a029177b?auto=format&fit=crop&w=1200&q=80",
    cta: "Conhecer produtos",
    link: "#features",
    badge: { icon: Star, label: "Sabor", value: "Único" },
    badge2: { icon: Clock, label: "Encomendas", value: "24h" }
  }
]

export function Hero() {
  const [current, setCurrent] = useState(0)
  const whatsappNumber = useConfigStore((state) => state.whatsappNumber)
  const heroSlides = useConfigStore((state) => state.heroSlides)

  const slides = baseSlides.map((slide, index) => {
    const config = heroSlides[index]
    if (!config) return slide
    return {
      ...slide,
      title: config.title,
      highlight: config.highlight,
      titleEnd: config.titleEnd,
      description: config.description,
      image: config.image,
      cta: config.cta,
      link: config.link,
    }
  })

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const nextSlide = () => setCurrent((prev) => (prev + 1) % slides.length)
  const prevSlide = () => setCurrent((prev) => (prev - 1 + slides.length) % slides.length)

  const currentSlide = slides[current]

  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center overflow-hidden pt-32 lg:pt-20"
    >
      {/* Background Elements */}
      <div className="absolute top-0 right-0 -z-10 h-[600px] w-[600px] rounded-full bg-secondary/30 blur-[120px]" />
      <div className="absolute bottom-0 left-0 -z-10 h-[500px] w-[500px] rounded-full bg-accent/10 blur-[100px]" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          
          {/* Text Content */}
          <div className="relative z-20">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col gap-8"
              >
                <h1 className="font-serif text-5xl font-bold leading-[1.1] sm:text-6xl lg:text-7xl text-primary tracking-tight">
                  {currentSlide.title}
                  <span className="text-accent italic">{currentSlide.highlight}</span>
                  {currentSlide.titleEnd}
                </h1>
                <p className="text-lg text-muted-foreground sm:text-xl max-w-lg leading-relaxed">
                  {currentSlide.description}
                </p>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Button size="lg" className="h-14 rounded-full px-8 text-lg shadow-xl shadow-primary/20 transition-transform hover:scale-105" asChild>
                    {currentSlide.link === "whatsapp" ? (
                      <a 
                        href={`https://wa.me/${whatsappNumber}?text=Olá! Gostaria de fazer uma encomenda.`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        {currentSlide.cta} <ArrowRight className="ml-2 h-5 w-5" />
                      </a>
                    ) : (
                      <a href={currentSlide.link}>
                        {currentSlide.cta} <ArrowRight className="ml-2 h-5 w-5" />
                      </a>
                    )}
                  </Button>
                  {currentSlide.link !== "whatsapp" && (
                     <Button size="lg" variant="outline" className="h-14 rounded-full border-primary/20 px-8 text-lg hover:bg-primary/5" asChild>
                      <a 
                        href={`https://wa.me/${whatsappNumber}?text=Olá! Gostaria de fazer uma encomenda.`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        Fazer encomenda
                      </a>
                    </Button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
            
            {/* Navigation Dots */}
            <div className="flex gap-3 mt-12">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrent(index)}
                  className={cn(
                    "h-3 rounded-full transition-all duration-300",
                    current === index ? "w-12 bg-primary" : "w-3 bg-primary/20 hover:bg-primary/40"
                  )}
                  aria-label={`Ir para slide ${index + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Image Content */}
          <div className="relative mx-auto w-full max-w-[500px] lg:max-w-[650px] aspect-square perspective-1000">
             <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0, scale: 0.95, rotateY: 10 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                exit={{ opacity: 0, scale: 0.95, rotateY: -10 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="relative h-full w-full"
              >
                <div className="relative h-full w-full rounded-[2.5rem] overflow-hidden shadow-2xl ring-1 ring-white/20 transform transition-transform hover:scale-[1.02] duration-500">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent z-10" />
                  <img
                    src={currentSlide.image}
                    alt={currentSlide.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Decorative Border */}
                  <div className="absolute inset-4 border border-white/30 rounded-[2rem] z-20 pointer-events-none" />
                </div>

                {/* Floating Badges - Dynamic based on slide */}
                <motion.div
                  initial={{ opacity: 0, x: -20, y: 20 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="absolute -left-4 sm:-left-8 top-12 sm:top-16 flex items-center gap-4 rounded-2xl bg-white/90 backdrop-blur-xl p-3 sm:p-4 sm:pr-6 shadow-xl border border-white/40 z-30"
                >
                  <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <currentSlide.badge.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">{currentSlide.badge.label}</p>
                    <p className="text-xs sm:text-sm font-bold text-foreground">{currentSlide.badge.value}</p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20, y: -20 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="absolute -right-4 sm:-right-8 bottom-16 sm:bottom-20 flex items-center gap-4 rounded-2xl bg-white/90 backdrop-blur-xl p-3 sm:p-4 sm:pr-6 shadow-xl border border-white/40 z-30"
                >
                  <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                    <currentSlide.badge2.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-accent/60 uppercase tracking-widest">{currentSlide.badge2.label}</p>
                    <p className="text-xs sm:text-sm font-bold text-foreground">{currentSlide.badge2.value}</p>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Buttons (Desktop) */}
            <div className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -left-4 z-20">
              <Button
                variant="outline"
                size="icon"
                onClick={prevSlide}
                className="h-12 w-12 rounded-full border-primary/20 bg-white/80 backdrop-blur hover:bg-white hover:text-primary shadow-lg"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
            </div>
            <div className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -right-4 z-20">
              <Button
                variant="outline"
                size="icon"
                onClick={nextSlide}
                className="h-12 w-12 rounded-full border-primary/20 bg-white/80 backdrop-blur hover:bg-white hover:text-primary shadow-lg"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
