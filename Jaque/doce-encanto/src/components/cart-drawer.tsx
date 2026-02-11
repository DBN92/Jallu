
import { ShoppingBag, Trash2, Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet"
import { useCartStore } from "@/store/cart-store"
import { useConfigStore } from "@/store/config-store"

export function CartDrawer() {
  const { items, removeItem, updateQuantity, total } = useCartStore()
  const whatsappNumber = useConfigStore((state) => state.whatsappNumber)

  const handleCheckout = () => {
    const phoneNumber = whatsappNumber || "5511999999999"
    
    const itemsList = items
      .map(
        (item) =>
          `▪️ *${item.quantity}x* ${item.name}\n   _Subtotal: R$ ${(item.price * item.quantity).toFixed(2)}_`
      )
      .join("\n\n")

    const totalValue = total().toFixed(2)

    const finalMessage = `*🍰 NOVO PEDIDO - JALLU CONFEITARIA 🍰*

*🛒 Resumo do Pedido:*
_____________________________

${itemsList}
_____________________________

*💰 VALOR TOTAL: R$ ${totalValue}*

*📍 Dados para Entrega:*
Nome:
Endereço:
Ponto de Referência:

*💳 Forma de Pagamento:*
( ) Pix
( ) Cartão
( ) Dinheiro`

    window.open(
      `https://wa.me/${phoneNumber}?text=${encodeURIComponent(finalMessage)}`,
      "_blank"
    )
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <ShoppingBag className="h-5 w-5" />
          {items.length > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {items.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md bg-primary text-primary-foreground border-l-primary-foreground/10">
        <SheetHeader>
          <SheetTitle className="text-primary-foreground">Seu Carrinho</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-2 text-primary-foreground/60">
              <ShoppingBag className="h-12 w-12 opacity-50" />
              <p>Seu carrinho está vazio.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center space-x-4 rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-3"
                >
                  <div className="relative h-16 w-16 overflow-hidden rounded-md bg-white/10">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-primary-foreground/20">
                        <ShoppingBag className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <h3 className="font-medium leading-none text-primary-foreground">{item.name}</h3>
                    <p className="text-sm text-primary-foreground/80">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(item.price)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
                        onClick={() => updateQuantity(item.id, Math.max(0, item.quantity - 1))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-4 text-center text-sm text-primary-foreground">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <SheetFooter className="border-t border-primary-foreground/10 pt-4 sm:justify-center">
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between text-lg font-bold text-primary-foreground">
                <span>Total</span>
                <span>
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  }).format(total())}
                </span>
              </div>
              <Button className="w-full h-12 text-lg bg-white text-primary hover:bg-white/90" onClick={handleCheckout}>
                Finalizar no WhatsApp
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
