import { useState } from "react"
import { X, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { workopsAsk, workopsIngest } from "@/lib/workops-agent"
import { useCartStore } from "@/store/cart-store"
import { useConfigStore } from "@/store/config-store"

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
}

function extractJson(text: string) {
  if (!text.includes("```")) {
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

function renderMessageContent(text: string) {
  if (!text.includes("```")) return text

  const parts = text.split("```")

  return parts.map((part, index) => {
    const trimmed = part.trim()

    if (!trimmed) {
      return null
    }

    if (index % 2 === 0) {
      return (
        <p key={index}>
          {trimmed}
        </p>
      )
    }

    let code = trimmed

    if (code.toLowerCase().startsWith("json")) {
      code = code.slice(4).trimStart()
    }

    try {
      const parsed = JSON.parse(code) as unknown

      if (parsed && typeof parsed === "object") {
        if (
          "products" in parsed &&
          Array.isArray((parsed as { products: unknown }).products)
        ) {
          const products = (parsed as { products: { nome?: string; descricao?: string; preco_por_kg?: number }[] }).products

          return (
            <div
              key={index}
              className="mt-2 space-y-2"
            >
              {products.map((product, i) => (
                <div
                  key={product.nome ?? i}
                  className="rounded-xl border border-border bg-background/80 px-3 py-2 text-[11px] leading-relaxed"
                >
                  <p className="font-semibold text-foreground">
                    {product.nome ?? "Produto"}
                  </p>
                  {product.descricao && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {product.descricao}
                    </p>
                  )}
                  {typeof product.preco_por_kg === "number" && (
                    <p className="mt-1 text-[10px] font-medium text-primary">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(product.preco_por_kg)}{" "}
                      / kg
                    </p>
                  )}
                </div>
              ))}
            </div>
          )
        }

        if (
          "order" in parsed &&
          parsed.order &&
          typeof (parsed as { order: unknown }).order === "object"
        ) {
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
            <div
              key={index}
              className="mt-2 space-y-2 rounded-xl border border-border bg-background/90 px-3 py-2 text-[11px] leading-relaxed"
            >
              <p className="text-[11px] font-semibold text-foreground">
                Comprovante do pedido
              </p>
              <p className="text-[10px] text-muted-foreground">
                {String(orderId)}
              </p>

              <div className="mt-2 space-y-1">
                {items.map((item, i) => {
                  const quantity = item.quantity ?? item.quantidade ?? 1
                  const price = item.price ?? item.preco ?? 0
                  const subtotal = quantity * price

                  return (
                    <div
                      key={`${item.id ?? i}`}
                      className="flex items-center justify-between text-[10px]"
                    >
                      <span className="text-muted-foreground">
                        {quantity}x {item.name ?? item.nome ?? "Item"}
                      </span>
                      <span className="font-medium">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(subtotal)}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-1">
                <span className="text-[10px] font-semibold text-foreground">
                  Total
                </span>
                <span className="text-[10px] font-semibold text-primary">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(total)}
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
      <pre
        key={index}
        className="mt-2 rounded-xl bg-black/80 px-3 py-2 text-[10px] leading-relaxed text-white overflow-x-auto"
      >
        <code>{code}</code>
      </pre>
    )
  })
}

export function WorkopsChatWidget() {
  const cartItems = useCartStore((state) => state.items)
  const cartTotal = useCartStore((state) => state.total)
  const agentName = useConfigStore((state) => state.agentName)
  const agentSubtitle = useConfigStore((state) => state.agentSubtitle)
  const agentAvatarUrl = useConfigStore((state) => state.agentAvatarUrl)
  const agentWelcomeMessage = useConfigStore((state) => state.agentWelcomeMessage)
  const agentInputPlaceholder = useConfigStore((state) => state.agentInputPlaceholder)
  const agentSource = useConfigStore((state) => state.agentSource)
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

      const reply = await workopsAsk(trimmed, externalUserId, {
        cart: {
          items: cartItemsPayload,
          total: cartTotal(),
        },
        page: window.location.pathname,
        source: agentSource,
      })

      try {
        const jsonText = extractJson(reply)
        const parsed = JSON.parse(jsonText) as { order?: WorkopsOrder }
        if (parsed.order) {
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
          ).catch(() => undefined)
        }
      } catch {
      }
      const agentMessage: ChatMessage = {
        id: `${Date.now()}-agent`,
        from: "agent",
        text: reply,
      }
      setMessages((prev) => [...prev, agentMessage])
    } catch (_error) {
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
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
                  {renderMessageContent(message.text)}
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

          <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={agentInputPlaceholder}
              className="h-10 rounded-full bg-background text-xs"
            />
            <Button
              size="icon"
              className="h-10 w-10 rounded-full"
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
        className="h-14 w-14 rounded-full shadow-xl border border-primary/20 bg-white overflow-hidden p-0"
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
