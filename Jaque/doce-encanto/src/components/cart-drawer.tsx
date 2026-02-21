
import { ShoppingBag, Trash2, Plus, Minus } from "lucide-react"
import { useState } from "react"
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
import { useOrdersStore } from "@/store/orders-store"

export function CartDrawer() {
  const { items, removeItem, updateQuantity, total } = useCartStore()
  const whatsappNumber = useConfigStore((state) => state.whatsappNumber)
  const shippingFee = useConfigStore((state) => state.shippingFee)
  const addOrderFromAgent = useOrdersStore((state) => state.addOrderFromAgent)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery")
  const [zipCode, setZipCode] = useState("")
  const [addressNumber, setAddressNumber] = useState("")
  const [addressText, setAddressText] = useState("")

  const handleCepBlur = () => {
    const cepDigits = zipCode.replace(/\D+/g, "")
    if (cepDigits.length !== 8) return
    fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
      .then((response) => response.json())
      .then((data) => {
        if (!data || data.erro) {
          setAddressText("")
          return
        }
        const parts = [
          data.logradouro || "",
          data.bairro || "",
          data.localidade && data.uf ? `${data.localidade}/${data.uf}` : "",
        ].filter(Boolean)
        setAddressText(parts.join(" - "))
      })
      .catch(() => {
        setAddressText("")
      })
  }

  const handleCheckout = () => {
    const name = customerName.trim()
    const phoneDigits = customerPhone.replace(/\D+/g, "")
    if (!name || phoneDigits.length < 10) {
      alert("Informe nome completo e WhatsApp válido.")
      return
    }
    if (fulfillment === "delivery") {
      const zipDigits = zipCode.replace(/\D+/g, "")
      if (zipDigits.length < 8 || !addressNumber.trim()) {
        alert("Informe CEP e número para entrega.")
        return
      }
    }
    const phoneNumber = whatsappNumber || "5511999999999"
    
    const itemsList = items
      .map(
        (item) =>
          `▪️ *${item.quantity}x* ${item.name}\n   _Subtotal: R$ ${(item.price * item.quantity).toFixed(2)}_`
      )
      .join("\n\n")

    const itemsTotal = total()
    const totalWithShipping = itemsTotal + (fulfillment === "delivery" ? shippingFee : 0)
    const itemsTotalText = itemsTotal.toFixed(2)
    const shippingText = (fulfillment === "delivery" ? shippingFee : 0).toFixed(2)
    const totalValue = totalWithShipping.toFixed(2)

    const finalMessage = `*🍰 NOVO PEDIDO - JALLU CONFEITARIA 🍰*

*🛒 Resumo do Pedido:*
_____________________________

${itemsList}
_____________________________

*💰 ITENS: R$ ${itemsTotalText}*
*🚚 FRETE: R$ ${shippingText}*
*💰 TOTAL COM FRETE: R$ ${totalValue}*

*📍 Dados do Cliente:*
Nome: ${name}
WhatsApp: ${phoneDigits}
Tipo: ${fulfillment === "delivery" ? "Entrega" : "Retirada"}
CEP: ${zipCode || "-"}
Número: ${addressNumber || "-"}
Endereço: ${addressText || "-"}

*💳 Forma de Pagamento:*
( ) Pix
( ) Cartão
( ) Dinheiro`

    window.open(
      `https://wa.me/${phoneNumber}?text=${encodeURIComponent(finalMessage)}`,
      "_blank"
    )
  }

  const handleCheckoutSite = () => {
    if (items.length === 0) return
    const orderItems = items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      category: item.category,
    }))
    const totalValue = total() + (fulfillment === "delivery" ? shippingFee : 0)
    try {
      addOrderFromAgent({
        items: orderItems,
        total: totalValue,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.replace(/\D+/g, "") || null,
        fulfillment,
        shippingFee: fulfillment === "delivery" ? shippingFee : 0,
        zipCode: zipCode || null,
        addressNumber: addressNumber || null,
        addressLine: addressText || null,
      })
    } catch {
    }
    window.location.href = "/orders"
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
              <div className="space-y-3">
                <div className="grid gap-2">
                  <input
                    className="h-9 rounded-md border border-primary-foreground/30 bg-primary-foreground/5 px-3 text-sm text-primary-foreground"
                    placeholder="Nome completo"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                  />
                  <input
                    className="h-9 rounded-md border border-primary-foreground/30 bg-primary-foreground/5 px-3 text-sm text-primary-foreground"
                    placeholder="WhatsApp (apenas números)"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                  />
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className={`flex-1 rounded-full border px-3 py-1 ${fulfillment === "delivery" ? "bg-white text-primary border-white" : "border-primary-foreground/40 text-primary-foreground/80"}`}
                    onClick={() => setFulfillment("delivery")}
                  >
                    Entrega
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-full border px-3 py-1 ${fulfillment === "pickup" ? "bg-white text-primary border-white" : "border-primary-foreground/40 text-primary-foreground/80"}`}
                    onClick={() => setFulfillment("pickup")}
                  >
                    Retirar
                  </button>
                </div>
                {fulfillment === "delivery" && (
                  <div className="space-y-1">
                    <div className="grid grid-cols-[2fr,1fr] gap-2">
                      <input
                        className="h-9 rounded-md border border-primary-foreground/30 bg-primary-foreground/5 px-3 text-sm text-primary-foreground"
                        placeholder="CEP"
                        value={zipCode}
                        onChange={(event) => setZipCode(event.target.value)}
                        onBlur={handleCepBlur}
                      />
                      <input
                        className="h-9 rounded-md border border-primary-foreground/30 bg-primary-foreground/5 px-3 text-sm text-primary-foreground"
                        placeholder="Número"
                        value={addressNumber}
                        onChange={(event) => setAddressNumber(event.target.value)}
                      />
                    </div>
                    {addressText && (
                      <p className="text-[11px] text-primary-foreground/80">
                        {addressText}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-lg font-bold text-primary-foreground">
                <span>Total</span>
                <span>
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  }).format(total() + (fulfillment === "delivery" ? shippingFee : 0))}
                </span>
              </div>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full h-11 text-sm border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={handleCheckoutSite}
                >
                  Finalizar pelo site
                </Button>
                <Button className="w-full h-12 text-lg bg-white text-primary hover:bg-white/90" onClick={handleCheckout}>
                  Finalizar no WhatsApp
                </Button>
              </div>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
