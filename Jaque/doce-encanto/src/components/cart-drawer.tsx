"use client"

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
import Image from "next/image"

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
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Seu Carrinho</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-2 text-muted-foreground">
              <ShoppingBag className="h-12 w-12 opacity-20" />
              <p>Seu carrinho está vazio.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center space-x-4 rounded-lg border p-3"
                >
                  <div className="relative h-16 w-16 overflow-hidden rounded-md bg-secondary/10">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-primary/20">
                        <ShoppingBag className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="font-medium text-sm line-clamp-1">{item.name}</h4>
                    <p className="text-sm font-semibold">
                      R$ {item.price.toFixed(2)}
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm w-4 text-center">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive/90"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <SheetFooter className="border-t pt-4">
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span>R$ {total().toFixed(2)}</span>
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={handleCheckout}
              >
                Finalizar no WhatsApp
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
