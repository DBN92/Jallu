
import { Link } from "react-router-dom"
import { Facebook, Instagram, Twitter, MapPin, Phone, Mail } from "lucide-react"
import { Logo } from "@/components/logo"
import { useConfigStore } from "@/store/config-store"

export function Footer() {
  const whatsappNumber = useConfigStore((state) => state.whatsappNumber)
  const footerDescription = useConfigStore((state) => state.footerDescription)
  const contactEmail = useConfigStore((state) => state.contactEmail)
  const displayPhone = whatsappNumber
    .replace(/^55/, "")
    .replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")

  return (
    <footer id="contact" className="bg-primary py-12 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.03] pointer-events-none" />

      <div className="container mx-auto px-4 grid gap-10 md:grid-cols-4 relative z-10">
        <div className="md:col-span-2 space-y-6 flex flex-col justify-start">
          <Logo variant="footer" className="h-10 w-auto -ml-2" />
          <p className="text-white/90 max-w-sm text-sm leading-relaxed -mt-2">
            {footerDescription}
          </p>
          <div className="flex gap-4">
            <Link
              to="#"
              className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white hover:text-primary border border-white/10 transition-all duration-300 group"
            >
              <Instagram className="h-5 w-5 group-hover:scale-110 transition-transform" />
            </Link>
            <Link
              to="#"
              className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white hover:text-primary border border-white/10 transition-all duration-300 group"
            >
              <Facebook className="h-5 w-5 group-hover:scale-110 transition-transform" />
            </Link>
            <Link
              to="#"
              className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white hover:text-primary border border-white/10 transition-all duration-300 group"
            >
              <Twitter className="h-5 w-5 group-hover:scale-110 transition-transform" />
            </Link>
          </div>
        </div>

        <div className="pt-2 md:pt-4">
          <h4 className="font-serif text-xl mb-6 text-white">Contato</h4>
          <ul className="space-y-4 text-sm text-white/90">
            <li className="flex items-start gap-3 group">
              <MapPin className="h-5 w-5 text-white/80 shrink-0 mt-0.5 group-hover:text-white transition-colors" />
              <span className="leading-tight">
                Rua das Flores, 123
                <br />
                Jardim Doce, SP
              </span>
            </li>
            <li className="flex items-center gap-3 group">
              <Phone className="h-5 w-5 text-white/80 shrink-0 group-hover:text-white transition-colors" />
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                {displayPhone}
              </a>
            </li>
            <li className="flex items-center gap-3 group">
              <Mail className="h-5 w-5 text-white/80 shrink-0 group-hover:text-white transition-colors" />
              <span>{contactEmail}</span>
            </li>
          </ul>
        </div>

        <div className="pt-2 md:pt-4">
          <h4 className="font-serif text-xl mb-6 text-white">Horários</h4>
          <ul className="space-y-3 text-sm text-white/90">
            <li className="flex justify-between items-center gap-4 border-b border-white/10 pb-2">
              <span>Seg - Sex</span>
              <span className="text-white font-medium">09h - 19h</span>
            </li>
            <li className="flex justify-between items-center gap-4 border-b border-white/10 pb-2">
              <span>Sábado</span>
              <span className="text-white font-medium">09h - 18h</span>
            </li>
            <li className="flex justify-between items-center gap-4 border-b border-white/10 pb-2">
              <span>Domingo</span>
              <span className="text-white font-medium">09h - 13h</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12 pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-white/60 uppercase tracking-widest">
        <p>&copy; {new Date().getFullYear()} Jallu Confeitaria.</p>
        <div className="flex gap-8">
          <a
            href="https://dbn.dbncustom.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            desenvolvido por Syvops
          </a>
        </div>
      </div>
    </footer>
  )
}
