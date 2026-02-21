import { useEffect, useState } from 'react'
import { useOrdersStore, type OrderStatus } from '@/store/orders-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { workopsGetOrderStatus } from '@/lib/workops-agent'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

function statusLabel(status: string | undefined) {
  switch (status) {
    case 'pending':
      return 'Pendente'
    case 'accepted':
      return 'Aceito'
    case 'rejected':
      return 'Rejeitado'
    case 'processing':
      return 'Em preparação'
    case 'completed':
      return 'Concluído'
    default:
      return 'Desconhecido'
  }
}

function statusColor(status: string | undefined) {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'accepted':
      return 'bg-blue-100 text-blue-800'
    case 'rejected':
      return 'bg-red-100 text-red-800'
    case 'processing':
      return 'bg-purple-100 text-purple-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function buildTimeline(status: OrderStatus | undefined) {
  const steps: { key: OrderStatus; label: string }[] = [
    { key: 'pending', label: 'Recebido' },
    { key: 'accepted', label: 'Aceito' },
    { key: 'processing', label: 'Em preparação' },
    { key: 'completed', label: 'Concluído' },
  ]
  if (status === 'rejected') {
    return [
      { key: 'pending', label: 'Recebido' },
      { key: 'rejected', label: 'Rejeitado' },
    ]
  }
  return steps
}

export default function OrdersPage() {
  const orders = useOrdersStore((state) => state.orders)
  const updateOrderStatus = useOrdersStore((state) => state.updateOrderStatus)
  const upsertOrders = useOrdersStore((state) => state.upsertOrders)
  const [codeInput, setCodeInput] = useState('')
  const [lookupMsg, setLookupMsg] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const normalizeCode = (value: string) => value.replace(/\s+/g, '').toUpperCase()
  const findLocalOrderByCode = (code: string) => {
    const normalized = normalizeCode(code)
    return orders.find((order) => normalizeCode(String(order.codigo ?? order.id ?? '')) === normalized)
  }
  const selectedOrder = selectedCode
    ? orders.find((order) => normalizeCode(String(order.codigo ?? order.id ?? '')) === normalizeCode(selectedCode))
    : null

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      setCodeInput(code)
      ;(async () => {
        const externalUserId = getExternalUserId()
        const status = await workopsGetOrderStatus(code, externalUserId)
        if (status?.status) {
          upsertOrders([
            {
              codigo: code,
              status: status.status as OrderStatus,
              updatedAt: status.updated_at ?? new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ])
          setLookupMsg('Pedido localizado/atualizado.')
          setSelectedCode(code)
          setDetailsOpen(true)
        } else {
          const localOrder = findLocalOrderByCode(code)
          if (localOrder) {
            upsertOrders([localOrder])
            setLookupMsg('Pedido localizado.')
            setSelectedCode(code)
            setDetailsOpen(true)
          } else {
            setLookupMsg('Não encontramos esse código. Verifique e tente novamente.')
          }
        }
      })()
    }
  }, [])

  const getExternalUserId = () => {
    const key = 'workops-external-user-id'
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const generated = `jallu_${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(key, generated)
    return generated
  }

  const handleRefreshStatus = async (idOrCodigo: string) => {
    const externalUserId = getExternalUserId()
    const status = await workopsGetOrderStatus(idOrCodigo, externalUserId)
    if (status?.status) {
      updateOrderStatus(idOrCodigo, (status.status as OrderStatus) ?? 'unknown', status.updated_at)
    }
  }

  const handleLookupByCode = async () => {
    const code = codeInput.trim()
    if (!code) return
    setLookupMsg(null)
    const externalUserId = getExternalUserId()
    const status = await workopsGetOrderStatus(code, externalUserId)
    if (status?.status) {
      upsertOrders([
        {
          codigo: code,
          status: status.status as OrderStatus,
          updatedAt: status.updated_at ?? new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ])
      setLookupMsg('Pedido localizado/atualizado.')
      setSelectedCode(code)
      setDetailsOpen(true)
    } else {
      const localOrder = findLocalOrderByCode(code)
      if (localOrder) {
        upsertOrders([localOrder])
        setLookupMsg('Pedido localizado.')
        setSelectedCode(code)
        setDetailsOpen(true)
      } else {
        setLookupMsg('Não encontramos esse código. Verifique e tente novamente.')
      }
    }
  }

  return (
    <section className="container mx-auto px-6 pt-36 pb-24 md:pt-44">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Meus pedidos
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Aqui você acompanha o status dos pedidos feitos pelo assistente virtual.
        </p>
      </div>

      <div className="mb-8 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="Digite o código do pedido (ex.: ABC123)"
          className="rounded-full"
        />
        <Button className="rounded-full" onClick={handleLookupByCode}>
          Acompanhar
        </Button>
        {lookupMsg && <p className="text-xs text-muted-foreground sm:col-span-2">{lookupMsg}</p>}
      </div>

      {selectedOrder && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3">
              <div className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Pedido {selectedOrder.codigo ?? selectedOrder.id}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Criado em {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString('pt-BR') : 'data desconhecida'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={statusColor(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => selectedOrder && handleRefreshStatus(String(selectedOrder.codigo ?? selectedOrder.id))}
                  >
                    Atualizar status
                  </Button>
                </div>
              </div>
              <div className="mt-1">
                <p className="mb-1 text-[11px] font-medium text-foreground">Linha do tempo</p>
                <div className="flex items-center gap-2">
                  {buildTimeline(selectedOrder.status as OrderStatus | undefined).map((step, index, all) => {
                    const currentStatus = selectedOrder.status ?? 'pending'
                    const currentIndex = all.findIndex((s) => s.key === currentStatus)
                    const isDone = currentIndex > index
                    const isCurrent = currentIndex === index
                    const isFuture = currentIndex < index
                    return (
                      <div key={step.key} className="flex items-center gap-2 text-[11px]">
                        <div
                          className={
                            isDone
                              ? 'h-5 w-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px]'
                              : isCurrent
                              ? 'h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]'
                              : 'h-5 w-5 rounded-full border border-muted-foreground/40 text-muted-foreground flex items-center justify-center text-[10px]'
                          }
                        >
                          {index + 1}
                        </div>
                        <span
                          className={
                            isDone
                              ? 'text-[11px] text-foreground'
                              : isCurrent
                              ? 'text-[11px] text-foreground font-medium'
                              : 'text-[11px] text-muted-foreground'
                          }
                        >
                          {step.label}
                        </span>
                        {index < all.length - 1 && (
                          <div
                            className={
                              isFuture
                                ? 'h-px w-5 bg-muted-foreground/30'
                                : 'h-px w-5 bg-primary'
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-foreground">Itens</p>
                  <ul className="space-y-1">
                    {selectedOrder.items.map((item, index) => (
                      <li key={item.id ?? index} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {item.quantity ?? 1}x {item.name ?? 'Item'}
                        </span>
                        {typeof item.price === 'number' && (
                          <span className="font-medium">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format((item.quantity ?? 1) * item.price)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedOrder.fulfillment === 'delivery' && (
                <div className="border-t border-border/60 pt-2 space-y-1">
                  <p className="text-xs font-medium text-foreground">Entrega</p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedOrder.addressLine ||
                      [
                        selectedOrder.zipCode ? `CEP: ${selectedOrder.zipCode}` : '',
                        selectedOrder.addressNumber ? `Número: ${selectedOrder.addressNumber}` : '',
                      ]
                        .filter(Boolean)
                        .join(' • ') ||
                      'Endereço não informado'}
                  </p>
                  {typeof selectedOrder.shippingFee === 'number' && (
                    <p className="text-[11px] text-muted-foreground">
                      Frete:{' '}
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }).format(selectedOrder.shippingFee)}
                    </p>
                  )}
                </div>
              )}

              {typeof selectedOrder.total === 'number' && (
                <div className="flex items-center justify-between border-t border-border/60 pt-2">
                  <span className="text-xs font-semibold text-foreground">Total</span>
                  <span className="text-xs font-semibold text-primary">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(selectedOrder.total)}
                  </span>
                </div>
              )}

              {selectedOrder.payment_link && (
                <a
                  href={selectedOrder.payment_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-3 py-2 text-[11px] font-medium text-primary-foreground mt-2"
                >
                  Abrir link de pagamento
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="sm:max-w-lg mx-auto w-full">
          <SheetHeader>
            <SheetTitle>Detalhes do pedido</SheetTitle>
          </SheetHeader>
          {!selectedOrder ? (
            <p className="mt-4 text-sm text-muted-foreground">Nenhum pedido selecionado.</p>
          ) : (
            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Código</p>
                  <p className="font-mono text-sm">{selectedOrder.codigo ?? selectedOrder.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Criado em</p>
                  <p>{selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString('pt-BR') : '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cliente</p>
                  <p>{selectedOrder.customerName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Telefone</p>
                  <p>{selectedOrder.customerPhone ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Entrega/retirada</p>
                  <p>
                    {selectedOrder.fulfillment
                      ? selectedOrder.fulfillment === 'delivery'
                        ? 'Entrega'
                        : 'Retirada'
                      : '—'}
                  </p>
                </div>
                {selectedOrder.fulfillment === 'delivery' && (
                  <div className="col-span-2 space-y-1">
                    <p className="text-muted-foreground">Endereço de entrega</p>
                    <p className="text-[11px]">
                      {selectedOrder.addressLine ||
                        [
                          selectedOrder.zipCode ? `CEP: ${selectedOrder.zipCode}` : '',
                          selectedOrder.addressNumber ? `Número: ${selectedOrder.addressNumber}` : '',
                        ]
                          .filter(Boolean)
                          .join(' • ') ||
                        'Endereço não informado'}
                    </p>
                    {typeof selectedOrder.shippingFee === 'number' && (
                      <p className="text-[11px] text-muted-foreground">
                        Frete:{' '}
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(selectedOrder.shippingFee)}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Itens</p>
                  <ul className="space-y-1">
                    {selectedOrder.items.map((item, index) => (
                      <li key={item.id ?? index} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {item.quantity ?? 1}x {item.name ?? 'Item'}
                        </span>
                        {typeof item.price === 'number' && (
                          <span className="font-medium">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format((item.quantity ?? 1) * item.price)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">
                  {typeof selectedOrder.total === 'number'
                    ? new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }).format(selectedOrder.total)
                    : '—'}
                </span>
              </div>
              {selectedOrder.payment_link && (
                <a
                  href={selectedOrder.payment_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-3 py-2 text-[11px] font-medium text-primary-foreground mt-2"
                >
                  Abrir link de pagamento
                </a>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}
