"use client"

import * as React from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CartDrawer } from "@/components/cart-drawer"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"

const navigation = [
  { name: "Início", href: "#hero" },
  { name: "Cardápio", href: "#menu" },
  { name: "Destaques", href: "#features" },
  { name: "Depoimentos", href: "#testimonials" },
  { name: "Contato", href: "#contact" },
]

export function Header() {
  const [isScrolled, setIsScrolled] = React.useState(false)

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
          : "py-2 bg-transparent"
      )}
    >
      <div className={cn(
        "container mx-auto flex items-center justify-between px-6 transition-all duration-500",
        isScrolled ? "bg-white/80 backdrop-blur-md rounded-b-3xl py-1 shadow-sm" : ""
      )}>
        <Link href="/" className="group">
          <Logo className={cn("origin-left transition-all duration-500", isScrolled ? "h-20" : "")} />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="relative text-sm font-medium text-foreground/80 hover:text-primary transition-colors after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-0 after:bg-primary after:transition-all hover:after:w-full"
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <CartDrawer />
          <Button className="hidden md:inline-flex rounded-full px-6 shadow-none hover:shadow-lg transition-all" asChild>
            <Link href="#contact">Fazer encomenda</Link>
          </Button>

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <div className="flex flex-col gap-6 mt-8">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="text-lg font-medium"
                  >
                    {item.name}
                  </Link>
                ))}
                <Button className="w-full" asChild>
                  <Link href="#contact">Fazer encomenda</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
