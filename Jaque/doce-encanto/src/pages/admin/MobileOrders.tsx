import { useEffect, useMemo, useState } from "react"
import { useOrdersStore, type OrderStatus } from "@/store/orders-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useConfigStore } from "@/store/config-store"

const statusLabel = (s?: OrderStatus | null) => {
  switch (s) {
    case "pending":
      return "Pendente"
    case "accepted":
      return "Aceito"
    case "processing":
      return "Em preparação"
    case "completed":
      return "Concluído"
    case "rejected":
      return "Rejeitado"
    default:
      return "Desconhecido"
  }
}

const statusColor = (s?: OrderStatus | null) => {
  switch (s) {
    case "pending":
      return "bg-yellow-500 text-white"
    case "accepted":
      return "bg-blue-500 text-white"
    case "processing":
      return "bg-purple-600 text-white"
    case "completed":
      return "bg-green-600 text-white"
    case "rejected":
      return "bg-destructive text-destructive-foreground"
    default:
      return "bg-muted text-foreground"
  }
}

export default function MobileOrdersPage() {
  const orders = useOrdersStore((s) => s.orders)
  const fetchOrders = useOrdersStore((s) => s.fetchOrders)
  const updateOrderStatus = useOrdersStore((s) => s.updateOrderStatus)
  const whatsappNumber = useConfigStore((s) => s.whatsappNumber)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | OrderStatus>("all")
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders
      .filter((o) => (filter === "all" ? true : (o.status ?? "pending") === filter))
      .filter((o) => {
        if (!q) return true
        const code = String(o.codigo ?? o.id ?? "").toLowerCase()
        const name = String(o.customerName ?? "").toLowerCase()
        const phone = String(o.customerPhone ?? "").toLowerCase()
        return code.includes(q) || name.includes(q) || phone.includes(q)
      })
  }, [orders, filter, query])

  const selected = selectedCode
    ? orders.find((o) => String(o.codigo ?? o.id) === selectedCode)
    : null

  const openWhatsApp = (message: string) => {
    const clean = String(whatsappNumber ?? "").replace(/\D+/g, "")
    if (!clean) return
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank", "noopener")
  }

  const onChangeStatus = async (idOrCodigo: string, status: OrderStatus) => {
    await updateOrderStatus(idOrCodigo, status)
  }

  return (
    <section className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por código, nome ou telefone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={() => fetchOrders()}>Atualizar</Button>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {([
              { k: "all", l: "Todos" },
              { k: "pending", l: "Pendentes" },
              { k: "accepted", l: "Aceitos" },
              { k: "processing", l: "Preparando" },
              { k: "completed", l: "Concluídos" },
              { k: "rejected", l: "Rejeitados" },
            ] as Array<{ k: "all" | OrderStatus; l: string }>).map((s) => (
              <Button
                key={s.k}
                variant={filter === s.k ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(s.k)}
                className="rounded-full"
              >
                {s.l}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 space-y-3">
        {filtered.map((o) => {
          const code = String(o.codigo ?? o.id ?? "")
          return (
            <Card key={code} className="shadow-sm">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Pedido {code}</CardTitle>
                  <Badge className={statusColor(o.status)}>{statusLabel(o.status)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {o.createdAt ? new Date(o.createdAt).toLocaleString("pt-BR") : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-medium">{o.customerName ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Telefone</span>
                  <span className="font-medium">{o.customerPhone ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-primary">
                    {typeof o.total === "number"
                      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(o.total)
                      : "—"}
                  </span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSelectedCode(code)
                      setOpen(true)
                    }}
                  >
                    Detalhes
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => onChangeStatus(code, "accepted")}
                  >
                    Aprovar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhum pedido encontrado.</p>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="sm:max-w-lg mx-auto w-full">
          <SheetHeader>
            <SheetTitle>Detalhes do pedido</SheetTitle>
          </SheetHeader>
          {!selected ? (
            <p className="mt-4 text-sm text-muted-foreground">Nenhum pedido selecionado.</p>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Código</p>
                  <p className="font-mono text-sm">{selected.codigo ?? selected.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Criado em</p>
                  <p>{selected.createdAt ? new Date(selected.createdAt).toLocaleString("pt-BR") : "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cliente</p>
                  <p>{selected.customerName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Telefone</p>
                  <p>{selected.customerPhone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Entrega/retirada</p>
                  <p>
                    {selected.fulfillment
                      ? selected.fulfillment === "delivery"
                        ? "Entrega"
                        : "Retirada"
                      : "—"}
                  </p>
                </div>
                {selected.fulfillment === "delivery" && (
                  <div className="col-span-2 space-y-1">
                    <p className="text-muted-foreground">Endereço de entrega</p>
                    <p className="text-[12px]">
                      {selected.addressLine ||
                        [
                          selected.zipCode ? `CEP: ${selected.zipCode}` : "",
                          selected.addressNumber ? `Número: ${selected.addressNumber}` : "",
                        ]
                          .filter(Boolean)
                          .join(" • ") ||
                        "Endereço não informado"}
                    </p>
                    {typeof selected.shippingFee === "number" && (
                      <p className="text-xs text-muted-foreground">
                        Frete:{" "}
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(selected.shippingFee)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {selected.items && selected.items.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-foreground">Itens</p>
                  <ul className="space-y-1">
                    {selected.items.map((i, idx) => (
                      <li key={i.id ?? idx} className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">
                          {i.quantity}x {i.name}
                        </span>
                        {typeof i.price === "number" && (
                          <span className="font-medium">
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format((i.quantity ?? 1) * i.price)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border/60 pt-2">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">
                  {typeof selected.total === "number"
                    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selected.total)
                    : "—"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button variant="outline" onClick={() => onChangeStatus(String(selected.codigo ?? selected.id), "rejected")}>
                  Rejeitar
                </Button>
                <Button onClick={() => onChangeStatus(String(selected.codigo ?? selected.id), "accepted")}>
                  Aprovar
                </Button>
                <Button variant="secondary" onClick={() => onChangeStatus(String(selected.codigo ?? selected.id), "processing")}>
                  Preparar
                </Button>
                <Button variant="secondary" onClick={() => onChangeStatus(String(selected.codigo ?? selected.id), "completed")}>
                  Concluir
                </Button>
              </div>

              <div className="pt-1">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const code = String(selected.codigo ?? selected.id)
                    const trackUrl = `${window.location.origin}/orders?code=${code}`
                    const msg = `Pedido ${code}\n${trackUrl}`
                    openWhatsApp(msg)
                  }}
                >
                  Enviar link de acompanhamento no WhatsApp
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}
