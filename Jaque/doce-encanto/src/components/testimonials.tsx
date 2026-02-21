"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Star, Quote } from "lucide-react"
import { useConfigStore } from "@/store/config-store"

const MAX_TESTIMONIALS = 6

export function Testimonials() {
  const testimonialsTitle = useConfigStore((state) => state.testimonialsTitle)
  const testimonialsSubtitle = useConfigStore((state) => state.testimonialsSubtitle)
  const testimonials = useConfigStore((state) => state.testimonials).slice(0, MAX_TESTIMONIALS)

  return (
    <section id="testimonials" className="py-24 bg-white relative">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <h2 className="font-serif text-4xl font-bold text-primary sm:text-5xl mb-4">
            {testimonialsTitle}
          </h2>
          <p className="text-muted-foreground text-lg">
            {testimonialsSubtitle}
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <Card
              key={i}
              className="group relative bg-muted/10 border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-3xl overflow-visible mt-6"
            >
              <div className="absolute -top-6 left-8 bg-primary text-white p-3 rounded-2xl shadow-lg transform transition-transform group-hover:scale-110 group-hover:rotate-3">
                <Quote className="h-6 w-6 fill-current" />
              </div>
              <CardContent className="flex flex-col gap-6 p-8 pt-12">
                <div className="flex text-accent">
                  {[...Array(t.stars)].map((_, index) => (
                    <Star key={index} className="h-5 w-5 fill-current drop-shadow-sm" />
                  ))}
                </div>
                <p className="text-lg italic text-muted-foreground leading-relaxed">
                  &quot;{t.comment}&quot;
                </p>
                <div className="mt-auto pt-4 border-t border-primary/10">
                  <p className="font-bold text-primary text-lg">{t.name}</p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Cliente Verificado
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
