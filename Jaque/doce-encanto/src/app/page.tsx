import { Benefits } from "@/components/benefits";
import { CategoryCards } from "@/components/category-cards";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Newsletter } from "@/components/newsletter";
import { ProductGrid } from "@/components/product-grid";
import { Testimonials } from "@/components/testimonials";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen relative">
      <Header />
      <Hero />
      <CategoryCards />
      <Benefits />
      <ProductGrid />
      
      {/* How it works Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 text-center">
           <h2 className="font-serif text-3xl font-bold text-primary sm:text-4xl mb-12">
            Como Funciona
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold mb-4">1</div>
              <h3 className="font-bold text-lg mb-2">Escolha</h3>
              <p className="text-muted-foreground">Navegue pelo nosso cardápio e selecione suas delícias favoritas.</p>
            </div>
             <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold mb-4">2</div>
              <h3 className="font-bold text-lg mb-2">Personalize</h3>
              <p className="text-muted-foreground">Adicione ao carrinho e ajuste as quantidades conforme sua necessidade.</p>
            </div>
             <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold mb-4">3</div>
              <h3 className="font-bold text-lg mb-2">Receba</h3>
              <p className="text-muted-foreground">Finalize o pedido pelo WhatsApp e receba em casa com segurança.</p>
            </div>
          </div>
        </div>
      </section>

      <Testimonials />
      
      {/* Contact Section */}
      <section id="contact" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <h2 className="font-serif text-3xl font-bold text-primary sm:text-4xl mb-6">
            Vamos conversar?
          </h2>
          <p className="text-muted-foreground mb-8">
            Tem alguma dúvida ou pedido especial? Fale conosco diretamente pelo WhatsApp.
          </p>
          <Button size="lg" className="bg-green-600 hover:bg-green-700 gap-2" asChild>
            <Link href="https://wa.me/5511999999999" target="_blank">
              <MessageCircle className="h-5 w-5" /> Fale no WhatsApp
            </Link>
          </Button>
        </div>
      </section>

      <Newsletter />
      <Footer />

      {/* Floating WhatsApp Button */}
      <Link
        href="https://wa.me/5511999999999"
        target="_blank"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition-transform hover:scale-110 hover:bg-green-700"
        aria-label="Fale no WhatsApp"
      >
        <MessageCircle className="h-7 w-7" />
      </Link>
    </main>
  );
}
