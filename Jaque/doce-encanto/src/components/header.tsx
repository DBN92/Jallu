
import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CartDrawer } from "@/components/cart-drawer"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { useConfigStore } from "@/store/config-store"

const navigation = [
  { name: "Início", href: "#hero" },
  { name: "Cardápio", href: "#menu" },
  { name: "Destaques", href: "#features" },
  { name: "Depoimentos", href: "#testimonials" },
  { name: "Contato", href: "#contact" },
]

export function Header() {
  const whatsappNumber = useConfigStore((state) => state.whatsappNumber)
  const [isScrolled, setIsScrolled] = React.useState(false)
  const location = useLocation()
  const resolveHref = (hash: string) => (location.pathname === "/" ? hash : `/${hash}`)

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed top-0 z-40 w-full transition-all duration-500 ease-in-out",
        isScrolled
          ? "py-0"
          : "py-0 md:py-2 bg-transparent"
      )}
    >
      <div className={cn(
        "container mx-auto flex items-center justify-between px-6 transition-all duration-500",
        "bg-background/80 backdrop-blur-md shadow-sm",
        isScrolled 
          ? "md:bg-background/80 md:backdrop-blur-md md:rounded-b-3xl md:py-1 md:shadow-sm" 
          : "md:bg-transparent md:backdrop-blur-none md:shadow-none"
      )}>
        <Link to="/" className="group">
          <Logo className={cn("origin-left transition-all duration-500", isScrolled ? "h-20" : "")} />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={resolveHref(item.href)}
              className="relative text-sm font-medium text-foreground/80 hover:text-primary transition-colors after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-0 after:bg-primary after:transition-all hover:after:w-full"
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <CartDrawer />
          <Button variant="ghost" className="hidden md:inline-flex rounded-full px-4 shadow-none hover:shadow-lg" asChild>
            <Link to="/orders">Meus pedidos</Link>
          </Button>
          <Button className="hidden md:inline-flex rounded-full px-6 shadow-none hover:shadow-lg transition-all" asChild>
            <a 
              href={`https://wa.me/${whatsappNumber}?text=Olá! Gostaria de fazer uma encomenda.`} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Fazer encomenda
            </a>
          </Button>

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-rose-900 text-white border-rose-950/60">
              <SheetHeader>
                <SheetTitle className="text-white">Menu</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-6 mt-8">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={resolveHref(item.href)}
                    className="text-lg font-medium text-white/90 hover:text-white"
                  >
                    {item.name}
                  </Link>
                ))}
                <Button variant="outline" className="w-full border-white text-white hover:bg-white/10" asChild>
                  <Link to="/orders">Meus pedidos</Link>
                </Button>
                <Button className="w-full bg-white text-rose-900 hover:bg-white/90" asChild>
                  <a 
                    href={`https://wa.me/${whatsappNumber}?text=Olá! Gostaria de fazer uma encomenda.`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    Fazer encomenda
                  </a>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
