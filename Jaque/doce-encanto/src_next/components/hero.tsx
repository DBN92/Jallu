"use client"

import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { ArrowRight, Clock, Star } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center overflow-hidden pt-32 lg:pt-20"
    >
      {/* Background Elements */}
      <div className="absolute top-0 right-0 -z-10 h-[600px] w-[600px] rounded-full bg-secondary/30 blur-[120px]" />
      <div className="absolute bottom-0 left-0 -z-10 h-[500px] w-[500px] rounded-full bg-accent/10 blur-[100px]" />

      <div className="container mx-auto grid gap-12 px-4 lg:grid-cols-2 lg:items-center mt-8 sm:mt-0">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex flex-col gap-8"
        >
          <h1 className="font-serif text-5xl font-bold leading-[1.1] sm:text-6xl lg:text-7xl text-primary tracking-tight">
            Doces que transformam <span className="text-accent italic">momentos</span> em memória.
          </h1>
          <p className="text-lg text-muted-foreground sm:text-xl max-w-lg leading-relaxed">
            Experimente o sabor inesquecível de nossos bolos e doces feitos com
            ingredientes selecionados, técnica refinada e muito amor.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button size="lg" className="h-14 rounded-full px-8 text-lg shadow-xl shadow-primary/20 transition-transform hover:scale-105" asChild>
              <Link href="#menu">
                Ver cardápio <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 rounded-full border-primary/20 px-8 text-lg hover:bg-primary/5" asChild>
              <Link href="#contact">Fazer encomenda</Link>
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="relative mx-auto aspect-square w-full max-w-[500px] lg:max-w-[650px] perspective-1000"
        >
          {/* Main Image Container */}
          <div className="relative h-full w-full rounded-[2.5rem] overflow-hidden shadow-2xl ring-1 ring-white/20 transform transition-transform hover:scale-[1.02] duration-500">
             <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent z-10" />
             <Image
              src="https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=80"
              alt="Jallu Confeitaria"
              fill
              className="object-cover"
              priority
            />
            
            {/* Decorative Border */}
            <div className="absolute inset-4 border border-white/30 rounded-[2rem] z-20 pointer-events-none" />
          </div>

          {/* Modern Floating Cards */}
          <motion.div
            initial={{ opacity: 0, x: -20, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay: 0.6 }}
            className="absolute -left-8 top-16 flex items-center gap-4 rounded-2xl bg-white/90 backdrop-blur-xl p-4 pr-6 shadow-xl border border-white/40 animate-float hover:scale-105 transition-transform cursor-default"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Entrega</p>
              <p className="text-sm font-bold text-foreground">Rápida & Segura</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20, y: -20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay: 0.7 }}
            className="absolute -right-8 bottom-20 flex items-center gap-4 rounded-2xl bg-white/90 backdrop-blur-xl p-4 pr-6 shadow-xl border border-white/40 animate-float-delayed hover:scale-105 transition-transform cursor-default"
          >
             <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-accent/60 uppercase tracking-widest">Avaliação</p>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-foreground">4.9</span>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-2.5 w-2.5 fill-accent text-accent" />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
