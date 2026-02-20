"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfigStore } from "@/store/config-store"

export function Newsletter() {
  const whatsappNumber = useConfigStore((state) => state.whatsappNumber)
  const newsletterTitle = useConfigStore((state) => state.newsletterTitle)
  const newsletterSubtitle = useConfigStore((state) => state.newsletterSubtitle)
  const newsletterCta = useConfigStore((state) => state.newsletterCta)
  const newsletterDisclaimer = useConfigStore((state) => state.newsletterDisclaimer)

  return (
    <section className="py-24 px-4">
      <div className="container mx-auto">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-primary px-6 py-16 sm:px-16 sm:py-24 text-center shadow-2xl">
          <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />
          
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="font-serif text-3xl font-bold text-primary-foreground sm:text-5xl mb-6">
              {newsletterTitle}
            </h2>
            <p className="mb-10 text-lg text-primary-foreground/80 leading-relaxed">
              {newsletterSubtitle}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row max-w-md mx-auto">
              <Input 
                placeholder="Seu melhor e-mail" 
                className="h-12 rounded-full border-0 bg-white/90 px-6 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent" 
              />
              <Button size="lg" className="h-12 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 px-8 font-bold shadow-lg" asChild>
                <a 
                  href={`https://wa.me/${whatsappNumber}?text=Olá! Quero meu desconto de 10%.`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  {newsletterCta}
                </a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-primary-foreground/50">
              {newsletterDisclaimer}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
