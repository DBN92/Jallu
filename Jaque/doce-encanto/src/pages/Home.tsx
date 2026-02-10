
import { Hero } from '@/components/hero'
import { CategoryCards } from '@/components/category-cards'
import { Benefits } from '@/components/benefits'
import { ProductGrid } from '@/components/product-grid'
import { Testimonials } from '@/components/testimonials'
import { Newsletter } from '@/components/newsletter'

export default function Home() {
  return (
    <div className="relative">
      <Hero />
      <CategoryCards />
      <Benefits />
      <ProductGrid />
      <Testimonials />
      <Newsletter />
    </div>
  );
}
