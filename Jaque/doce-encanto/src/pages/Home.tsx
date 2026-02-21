
import { Hero } from '@/components/hero'
import { CategoryCards } from '@/components/category-cards'
import { Benefits } from '@/components/benefits'
import { ProductGrid } from '@/components/product-grid'
import { Testimonials } from '@/components/testimonials'
import { Newsletter } from '@/components/newsletter'
import { useConfigStore } from '@/store/config-store'

const sectionComponents: Record<string, () => JSX.Element> = {
  hero: Hero,
  categories: CategoryCards,
  benefits: Benefits,
  products: ProductGrid,
  testimonials: Testimonials,
  newsletter: Newsletter,
}

export default function Home() {
  const homeSectionsOrder = useConfigStore((state) => state.homeSectionsOrder)

  const sections =
    homeSectionsOrder && homeSectionsOrder.length > 0
      ? homeSectionsOrder
      : ['hero', 'categories', 'benefits', 'products', 'testimonials', 'newsletter']

  return (
    <div className="relative">
      {sections.map((section) => {
        const Component = sectionComponents[section]
        if (!Component) return null
        return <Component key={section} />
      })}
    </div>
  )
}
