"use client"

import { motion } from "framer-motion"
import { ChefHat, Leaf, Truck, Gift } from "lucide-react"
import { useConfigStore } from "@/store/config-store"

const baseBenefits = [
  {
    icon: Leaf,
    title: "Ingredientes Selecionados",
    description: "Utilizamos apenas ingredientes frescos e de alta qualidade.",
  },
  {
    icon: ChefHat,
    title: "Produção Artesanal",
    description: "Cada doce é feito à mão com carinho e dedicação.",
  },
  {
    icon: Truck,
    title: "Entrega Rápida",
    description: "Receba seus doces fresquinhos no conforto da sua casa.",
  },
  {
    icon: Gift,
    title: "Personalização",
    description: "Kits e bolos personalizados para tornar seu evento único.",
  },
]

export function Benefits() {
  const benefitsConfig = useConfigStore((state) => state.benefits)
  const benefits = baseBenefits.map((benefit, index) => {
    const config = benefitsConfig[index]
    if (!config) return benefit
    return {
      ...benefit,
      title: config.title,
      description: config.description,
    }
  })

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              viewport={{ once: true }}
              className="group flex flex-col items-center text-center p-6 rounded-3xl transition-all duration-300 hover:bg-white hover:shadow-xl hover:shadow-primary/5 border border-transparent hover:border-primary/5"
            >
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm text-primary transition-all duration-500 group-hover:scale-110 group-hover:bg-primary group-hover:text-white ring-1 ring-primary/10">
                <benefit.icon className="h-9 w-9" />
              </div>
              <h3 className="mb-3 font-serif text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                {benefit.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
