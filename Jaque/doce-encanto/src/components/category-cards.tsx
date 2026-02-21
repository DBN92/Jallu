
import { useProductStore } from "@/store/product-store"
import { useConfigStore } from "@/store/config-store"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"

export function CategoryCards() {
  const categories = useProductStore((state) => state.categories)
  const setActiveCategory = useProductStore((state) => state.setActiveCategory)
  const categoryTitle = useConfigStore((state) => state.categoryTitle)
  const categorySubtitle = useConfigStore((state) => state.categorySubtitle)

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      <div className="absolute top-10 left-10 h-32 w-32 rounded-full bg-secondary/20 blur-3xl" />
      <div className="absolute bottom-10 right-10 h-32 w-32 rounded-full bg-accent/10 blur-3xl" />

      <div className="container mx-auto px-4 relative">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-primary sm:text-4xl mb-4">
            {categoryTitle}
          </h2>
          <p className="text-muted-foreground text-lg">
            {categorySubtitle}
          </p>
        </div>

        <div className="flex gap-6 overflow-x-auto pb-8 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:overflow-visible scrollbar-hide">
          {categories.map((category, index) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              viewport={{ once: true }}
              className="min-w-[160px] flex-1"
            >
              <a href="#menu" className="block h-full">
                <div className="group relative h-full flex flex-col items-center justify-center rounded-3xl bg-muted/30 p-8 text-center transition-all duration-300 hover:bg-white hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-2 border border-transparent hover:border-primary/5">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm text-4xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                    {(category === "Bolos" || category === "Bolos especiais") && "🎂"}
                    {(category === "Brigadeiros" || category === "Doces finos") && "🍫"}
                    {(category === "Tortas" || category === "Tortas & cheesecakes") && "🥧"}
                    {(category === "Doces Finos" || category === "Doces finos") && "🍬"}
                    {(category === "Kits Festa" || category === "Kits & presentes") && "🎁"}
                  </div>
                  <h3 className="font-serif text-lg font-bold text-primary mb-2">
                    {category}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className="mt-auto flex items-center justify-center text-sm font-medium text-accent opacity-0 transition-all duration-300 transform translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"
                  >
                    Ver opções <ArrowRight className="ml-1 h-3 w-3" />
                  </button>
                </div>
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
