import { useState } from "react"
import { X, Send, Plus, Minus, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { workopsAsk, workopsIngest } from "@/lib/workops-agent"
import { useCartStore } from "@/store/cart-store"
import { useConfigStore } from "@/store/config-store"
import { useOrdersStore } from "@/store/orders-store"
import { useProductStore } from "@/store/product-store"

type ChatMessage = {
  id: string
  from: "user" | "agent"
  text: string
}

type WorkopsOrderItem = {
  id?: string
  name?: string
  nome?: string
  quantity?: number
  quantidade?: number
  price?: number
  preco?: number
}

type WorkopsOrder = {
  id?: string
  codigo?: string
  items?: WorkopsOrderItem[]
  total?: number
  total_valor?: number
  payment_link?: string
  customer_phone?: string
  phone?: string
  whatsapp?: string
  telefone?: string
  celular?: string
  customer_name?: string
  nome?: string
  cliente?: string
}

function extractJson(text: string) {
  if (!text.includes("```")) {
    const firstBrace = text.indexOf("{")
    const lastBrace = text.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1).trim()
    }
    return text.trim()
  }

  const firstFence = text.indexOf("```")
  const afterFirst = text.slice(firstFence + 3)
  const secondFence = afterFirst.indexOf("```")
  const inside = secondFence === -1 ? afterFirst : afterFirst.slice(0, secondFence)
  let code = inside.trim()

  if (code.toLowerCase().startsWith("json")) {
    code = code.slice(4).trimStart()
  }

  return code
}

 

declare global {
  interface Window {
    openAgentWithProduct?: (product: { id: string; name: string; price: number; category?: string | null }) => void
  }
}

export function WorkopsChatWidget() {
  const cartItems = useCartStore((state) => state.items)
  const cartTotal = useCartStore((state) => state.total)
  const addItem = useCartStore((state) => state.addItem)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const clearCart = useCartStore((state) => state.clearCart)
  const agentName = useConfigStore((state) => state.agentName)
  const agentSubtitle = useConfigStore((state) => state.agentSubtitle)
  const agentAvatarUrl = useConfigStore((state) => state.agentAvatarUrl)
  const agentWelcomeMessage = useConfigStore((state) => state.agentWelcomeMessage)
  const agentInputPlaceholder = useConfigStore((state) => state.agentInputPlaceholder)
  const agentSource = useConfigStore((state) => state.agentSource)
  const shippingFee = useConfigStore((state) => state.shippingFee)
  const addOrderFromAgent = useOrdersStore((state) => state.addOrderFromAgent)
  const siteProducts = useProductStore((state) => state.products)
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      from: "agent",
      text: agentWelcomeMessage,
    },
  ])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [highlightAgent, setHighlightAgent] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery")
  const [zipCode, setZipCode] = useState("")
  const [addressNumber, setAddressNumber] = useState("")
  const [addressText, setAddressText] = useState("")
  const [externalUserId] = useState(() => {
    const key = "workops-external-user-id"
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const generated = `jallu_${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(key, generated)
    return generated
  })

  const handleToggle = () => {
    setIsOpen((prev) => !prev)
  }

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

  const findSiteProduct = (hint: { id?: string; name?: string | null; nome?: string | null }) => {
    const byId = hint.id ? siteProducts.find((p) => p.id === hint.id) : undefined
    if (byId) return byId
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    const nm = normalize(String(hint.name ?? hint.nome ?? ""))
    if (!nm) return undefined
    const exact = siteProducts.find((p) => normalize(p.name) === nm)
    if (exact) return exact
    return siteProducts.find((p) => normalize(p.name).includes(nm))
  }

  const addToCartWithQuantity = (productIdOrName: { id?: string; name?: string | null; nome?: string | null }, quantity: number) => {
    if (quantity <= 0) return
    const prod = findSiteProduct(productIdOrName)
    if (!prod) return
    const existing = cartItems.find((i) => i.id === prod.id)
    if (!existing) {
      addItem(prod)
      if (quantity > 1) {
        updateQuantity(prod.id, quantity)
      }
    } else {
      updateQuantity(prod.id, existing.quantity + quantity)
    }
    workopsIngest(
      "add_to_cart",
      {
        productId: prod.id,
        name: prod.name,
        price: prod.price,
        category: prod.category,
        quantity,
        source: "chat",
      },
      externalUserId,
      String(prod.id)
    ).catch(() => {})
  }

  window.openAgentWithProduct = (product) => {
    addToCartWithQuantity({ id: product.id, name: product.name }, 1)
    setIsOpen(true)
    setCartOpen(true)
    setHighlightAgent(true)
    setTimeout(() => setHighlightAgent(false), 600)
  }

  function ChatProductList({ products }: { products: { id?: string; nome?: string; descricao?: string; preco_por_kg?: number }[] }) {
    const [qty, setQty] = useState<Record<string, number>>({})
    const onMinus = (key: string) => setQty((q) => ({ ...q, [key]: Math.max(1, (q[key] ?? 1) - 1) }))
    const onPlus = (key: string) => setQty((q) => ({ ...q, [key]: Math.min(99, (q[key] ?? 1) + 1) }))
    const currentQty = (key: string) => qty[key] ?? 1
    return (
      <div className="mt-2 space-y-2">
        {products.map((product, i) => {
          const key = product.id ?? String(i)
          const site = findSiteProduct({ id: product.id, name: product.nome })
          const displayName = site?.name ?? product.nome ?? "Produto"
          const price = site?.price ?? product.preco_por_kg
          return (
            <div key={key} className="rounded-xl border border-border bg-background/80 px-3 py-2 text-[11px] leading-relaxed">
              <p className="font-semibold text-foreground">{displayName}</p>
              {product.descricao && (
                <p className="mt-1 text-[10px] text-muted-foreground">{product.descricao}</p>
              )}
              {typeof price === "number" && (
                <p className="mt-1 text-[10px] font-medium text-primary">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price)}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onMinus(key)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="px-2 text-[11px]">{currentQty(key)}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onPlus(key)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="h-7 rounded-full"
                  onClick={() => {
                    addToCartWithQuantity({ id: product.id, name: product.nome }, currentQty(key))
                    setCartOpen(true)
                  }}
                >
                  Adicionar
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderMessageContentInteractive(text: string) {
    if (!text.includes("```")) return text
    const parts = text.split("```")
    return parts.map((part, index) => {
      const trimmed = part.trim()
      if (!trimmed) return null
      if (index % 2 === 0) {
        return <p key={index}>{trimmed}</p>
      }
      let code = trimmed
      if (code.toLowerCase().startsWith("json")) {
        code = code.slice(4).trimStart()
      }
      try {
        const parsed = JSON.parse(code) as unknown
        if (parsed && typeof parsed === "object") {
          if ("products" in parsed && Array.isArray((parsed as { products: unknown }).products)) {
            const products = (parsed as { products: { id?: string; nome?: string; descricao?: string; preco_por_kg?: number }[] }).products
            return <ChatProductList key={index} products={products} />
          }
          if ("order" in parsed && parsed.order && typeof (parsed as { order: unknown }).order === "object") {
            const order = (parsed as { order: WorkopsOrder }).order
            const items = Array.isArray(order.items) ? order.items : []
            const orderId = order.id ?? order.codigo ?? "Pedido"
            const total =
              order.total ??
              order.total_valor ??
              items.reduce((acc, item) => {
                const quantity = item.quantity ?? item.quantidade ?? 1
                const price = item.price ?? item.preco ?? 0
                return acc + quantity * price
              }, 0)
            return (
              <div key={index} className="mt-2 space-y-2 rounded-xl border border-border bg-background/90 px-3 py-2 text-[11px] leading-relaxed">
                <p className="text-[11px] font-semibold text-foreground">Comprovante do pedido</p>
                <p className="text-[10px] text-muted-foreground">{String(orderId)}</p>
                <div className="mt-2 space-y-1">
                  {items.map((item, i) => {
                    const quantity = item.quantity ?? item.quantidade ?? 1
                    const price = item.price ?? item.preco ?? 0
                    const subtotal = quantity * price
                    return (
                      <div key={`${item.id ?? i}`} className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">
                          {quantity}x {item.name ?? item.nome ?? "Item"}
                        </span>
                        <span className="font-medium">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(subtotal)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-1">
                  <span className="text-[10px] font-semibold text-foreground">Total</span>
                  <span className="text-[10px] font-semibold text-primary">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
                  </span>
                </div>
                {order.payment_link && (
                  <a
                    href={order.payment_link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-primary px-3 py-1 text-[10px] font-medium text-primary-foreground"
                  >
                    Abrir pagamento
                  </a>
                )}
              </div>
            )
          }
        }
      } catch {
      }
      return (
        <pre key={index} className="mt-2 rounded-xl bg-black/80 px-3 py-2 text-[10px] leading-relaxed text-white overflow-x-auto">
          <code>{code}</code>
        </pre>
      )
    })
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    const userMessage: ChatMessage = {
      id: String(Date.now()),
      from: "user",
      text: trimmed,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsSending(true)

    try {
      const cartItemsPayload = cartItems.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        category: item.category,
      }))

      // noop

      const instructionMessage = [
        "Você é o assistente virtual da confeitaria Jallu.",
        "Use exclusivamente o catálogo em 'catalog' e o carrinho em 'cart' do contexto.",
        "Ao fechar, peça nome e WhatsApp. Inclua ao final JSON: {\"order\":{...}} com id/codigo, items, total, opcional payment_link, customer_phone e customer_name.",
        "Responda em português do Brasil.",
      ].join(" ")

      const fullMessage = `${instructionMessage}\n\nMensagem do cliente: "${trimmed}"`

      const historyForAgent = [...messages, userMessage]
        .slice(-6)
        .map((message) => ({
          role: message.from === "user" ? "user" : "assistant",
          content: message.text,
        }))

      const reply = await workopsAsk(fullMessage, externalUserId, {
        cart: {
          items: cartItemsPayload,
          total: cartTotal(),
        },
        page: window.location.pathname,
        source: agentSource,
        catalog: {
          products: siteProducts.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            category: p.category,
          })),
        },
        history: historyForAgent,
      })

      try {
        const jsonText = extractJson(reply)
        const parsed = JSON.parse(jsonText) as { order?: WorkopsOrder }
        if (parsed.order) {
          // Normaliza o código do pedido para um hash de 6 caracteres (A-Z0-9)
          const codePattern = /^[A-Z0-9]{6}$/
          const existingCode = String(parsed.order.codigo ?? parsed.order.id ?? '').toUpperCase()
          const normalizedCode = codePattern.test(existingCode)
            ? existingCode
            : Math.random().toString(36).slice(2, 8).toUpperCase()
          parsed.order.id = normalizedCode
          parsed.order.codigo = normalizedCode
          const rawPhone =
            parsed.order.customer_phone ??
            parsed.order.phone ??
            parsed.order.whatsapp ??
            parsed.order.telefone ??
            parsed.order.celular
          const rawName =
            parsed.order.customer_name ??
            parsed.order.nome ??
            parsed.order.cliente
          if (rawPhone) {
            const digits = String(rawPhone).replace(/\D+/g, "")
            ;(parsed.order as WorkopsOrder & { customerPhone?: string }).customerPhone = digits
          }
          if (rawName) {
            const name = String(rawName).trim()
            ;(parsed.order as WorkopsOrder & { customerName?: string }).customerName = name
          }

          try {
            addOrderFromAgent(parsed.order, { externalUserId, source: agentSource })
          } catch {
          }
          workopsIngest(
            "order_created",
            {
              order: parsed.order,
              cart: {
                items: cartItemsPayload,
                total: cartTotal(),
              },
              source: agentSource,
            },
            externalUserId,
            parsed.order.id ?? parsed.order.codigo ?? undefined
          ).catch((error) => {
            console.error("[WorkOps] Falha ao enviar pedido para ingestão", error)
          })
        }
      } catch {
      }
      const agentMessage: ChatMessage = {
        id: `${Date.now()}-agent`,
        from: "agent",
        text: reply,
      }
      setMessages((prev) => [...prev, agentMessage])
    } catch {
      const agentMessage: ChatMessage = {
        id: `${Date.now()}-error`,
        from: "agent",
        text: "Não consegui falar com o assistente agora. Tente novamente em instantes.",
      }
      setMessages((prev) => [...prev, agentMessage])
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-80 max-w-[90vw] rounded-3xl bg-background/95 text-foreground shadow-2xl border border-border backdrop-blur-lg">
          <div className="flex items-center justify-between px-4 py-4 border-b border-border/60">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-white overflow-hidden border border-primary/20 flex items-center justify-center">
                <img
                    src={agentAvatarUrl}
                    alt={agentName}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                    {agentName}
                </p>
                <p className="text-xs text-muted-foreground">
                    {agentSubtitle}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={handleToggle}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto px-4 py-3 text-sm">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.from === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div
                  className={
                    message.from === "user"
                      ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-xs"
                      : "max-w-[80%] rounded-2xl rounded-bl-sm bg-secondary/40 text-foreground px-3 py-2 text-xs"
                  }
                >
                  {renderMessageContentInteractive(message.text)}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-secondary/40 text-foreground px-3 py-2 text-[11px]">
                  Digitando...
                </div>
              </div>
            )}
          </div>

          {cartOpen && (
            <div className="mx-3 mb-2 rounded-xl border border-border bg-secondary/20 p-3 text-[11px]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span className="font-medium">Carrinho</span>
                </div>
                <span className="text-xs">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cartTotal())}
                </span>
              </div>
              {cartItems.length === 0 ? (
                <p className="text-muted-foreground">Seu carrinho está vazio.</p>
              ) : (
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{item.name}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-5 text-center">{item.quantity}</span>
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant={checkoutOpen ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() => setCheckoutOpen((v) => !v)}
                    >
                      Finalizar pelo site
                    </Button>
                  </div>
                  {checkoutOpen && (
                    <div className="mt-2 space-y-2">
                      <Input
                        placeholder="Nome do cliente"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="h-8"
                      />
                      <Input
                        placeholder="WhatsApp (ex.: 5511999999999)"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="h-8"
                      />
                      <div className="flex gap-2 text-[10px]">
                        <Button
                          type="button"
                          variant={fulfillment === "delivery" ? "default" : "outline"}
                          className="h-7 flex-1"
                          onClick={() => setFulfillment("delivery")}
                        >
                          Entrega
                        </Button>
                        <Button
                          type="button"
                          variant={fulfillment === "pickup" ? "default" : "outline"}
                          className="h-7 flex-1"
                          onClick={() => setFulfillment("pickup")}
                        >
                          Retirar
                        </Button>
                      </div>
                      {fulfillment === "delivery" && (
                        <div className="space-y-1">
                          <div className="grid grid-cols-[2fr,1fr] gap-2">
                            <Input
                              placeholder="CEP"
                              value={zipCode}
                              onChange={(e) => setZipCode(e.target.value)}
                              onBlur={handleCepBlur}
                              className="h-8"
                            />
                            <Input
                              placeholder="Número"
                              value={addressNumber}
                              onChange={(e) => setAddressNumber(e.target.value)}
                              className="h-8"
                            />
                          </div>
                          {addressText && (
                            <p className="text-[10px] text-muted-foreground">
                              {addressText}
                            </p>
                          )}
                        </div>
                      )}
                      <Button
                        className="w-full h-8 text-xs"
                        onClick={() => {
                          const digits = customerPhone.replace(/\D+/g, "")
                          if (digits.length < 10) {
                            alert("Informe um WhatsApp válido")
                            return
                          }
                          if (fulfillment === "delivery") {
                            const zipDigits = zipCode.replace(/\D+/g, "")
                            if (zipDigits.length < 8 || !addressNumber.trim()) {
                              alert("Informe CEP e número para entrega.")
                              return
                            }
                          }
                          const code = Math.random().toString(36).slice(2, 8).toUpperCase()
                          const items = cartItems.map((it) => ({
                            id: it.id,
                            name: it.name,
                            quantity: it.quantity,
                            price: it.price,
                            category: it.category,
                          }))
                          const totalVal = cartTotal() + (fulfillment === "delivery" ? shippingFee : 0)
                          const orderPayload = {
                            id: code,
                            codigo: code,
                            items,
                            total: totalVal,
                            customerPhone: digits,
                            customerName: customerName.trim() || null,
                            fulfillment,
                            shippingFee,
                            zipCode: zipCode || null,
                            addressNumber: addressNumber || null,
                            addressLine: addressText || null,
                          }
                          try {
                            addOrderFromAgent(orderPayload, { externalUserId, source: agentSource })
                          } catch {}
                          const receiptBlock = `\`\`\`json
${JSON.stringify({ order: orderPayload }, null, 2)}
\`\`\``
                          const receiptMsg: ChatMessage = {
                            id: `${Date.now()}-receipt-site`,
                            from: "agent",
                            text: receiptBlock,
                          }
                          setMessages((prev) => [...prev, receiptMsg])
                          clearCart()
                          setCartOpen(false)
                          setCheckoutOpen(false)
                          setCustomerName("")
                          setCustomerPhone("")
                        }}
                      >
                        Confirmar pedido
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={agentInputPlaceholder}
              className="h-10 rounded-full bg-background text-xs"
            />
      <Button
        variant={cartOpen ? "default" : "outline"}
        size="icon"
        className="h-10 w-10 rounded-full p-0 relative"
        onClick={() => setCartOpen((v) => !v)}
        title="Ver carrinho"
      >
        <ShoppingBag className="h-4 w-4" />
        {cartItems.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {cartItems.length}
          </span>
        )}
      </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full p-0"
              onClick={handleSend}
              disabled={isSending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Button
        size="icon"
        className={`h-14 w-14 rounded-full shadow-xl border border-primary/20 bg-white overflow-hidden p-0 ${highlightAgent ? "animate-bounce" : ""}`}
        onClick={handleToggle}
        aria-label={isOpen ? `Fechar chat ${agentName}` : `Abrir chat ${agentName}`}
      >
        <img
          src={agentAvatarUrl}
          alt={agentName}
          className="h-full w-full object-cover"
        />
      </Button>
    </div>
  )
}
