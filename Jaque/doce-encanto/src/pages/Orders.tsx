import { useEffect, useState } from 'react'
import { useOrdersStore, type OrderStatus } from '@/store/orders-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { workopsGetOrderStatus } from '@/lib/workops-agent'
import { Input } from '@/components/ui/input'

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

export default function OrdersPage() {
  const orders = useOrdersStore((state) => state.orders)
  const updateOrderStatus = useOrdersStore((state) => state.updateOrderStatus)
  const upsertOrders = useOrdersStore((state) => state.upsertOrders)
  const [codeInput, setCodeInput] = useState('')
  const [lookupMsg, setLookupMsg] = useState<string | null>(null)

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
        } else {
          setLookupMsg('Não encontramos esse código. Verifique e tente novamente.')
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
    } else {
      setLookupMsg('Não encontramos esse código. Verifique e tente novamente.')
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

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Você ainda não fez pedidos pelo assistente virtual.
        </p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id ?? order.codigo}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Pedido {order.codigo ?? order.id}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Criado em {order.createdAt ? new Date(order.createdAt).toLocaleString('pt-BR') : 'data desconhecida'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={statusColor(order.status)}>{statusLabel(order.status)}</Badge>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleRefreshStatus(String(order.codigo ?? order.id))}>
                    Atualizar status
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {order.items && order.items.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium text-foreground">Itens</p>
                    <ul className="space-y-1">
                      {order.items.map((item, index) => (
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

                {typeof order.total === 'number' && (
                  <div className="flex items-center justify-between border-t border-border/60 pt-2">
                    <span className="text-xs font-semibold text-foreground">Total</span>
                    <span className="text-xs font-semibold text-primary">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }).format(order.total)}
                    </span>
                  </div>
                )}

                {order.payment_link && (
                  <a
                    href={order.payment_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-full bg-primary px-3 py-2 text-[11px] font-medium text-primary-foreground mt-2"
                  >
                    Abrir link de pagamento
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
