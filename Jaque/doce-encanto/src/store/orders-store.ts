import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type OrderItem = {
  id?: string | null
  name?: string | null
  quantity?: number | null
  price?: number | null
  category?: string | null
}

export type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'processing' | 'completed' | 'unknown'

export type Order = {
  id?: string | null
  codigo?: string | null
  items?: OrderItem[]
  total?: number | null
  payment_link?: string | null
  status?: OrderStatus
  customerPhone?: string | null
  customerName?: string | null
  paymentMethod?: string | null
  fulfillment?: 'delivery' | 'pickup' | null
  externalUserId?: string | null
  source?: string | null
  createdAt?: string
  updatedAt?: string
}

type OrdersState = {
  orders: Order[]
  addOrderFromAgent: (order: Partial<Order>, extra?: { externalUserId?: string | null; source?: string | null }) => void
  updateOrderStatus: (idOrCodigo: string, status: OrderStatus, updatedAt?: string) => void
  upsertOrders: (orders: Order[]) => void
}

function generateCode6() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      addOrderFromAgent: (order, extra) =>
        set((state) => {
          const now = new Date().toISOString()
          const incomingCode = String(order.codigo ?? order.id ?? '').toUpperCase()
          const codePattern = /^[A-Z0-9]{6}$/
          const finalCode = codePattern.test(incomingCode) ? incomingCode : generateCode6()
          const id = finalCode
          const exists = state.orders.find(
            (o) => (o.id && o.id === order.id) || (o.codigo && o.codigo === order.codigo) || o.id === id || o.codigo === id
          )
          const newOrder: Order = {
            id: id,
            codigo: id,
            items: order.items ?? [],
            total: order.total ?? null,
            payment_link: order.payment_link ?? null,
            status: 'pending',
            customerPhone: order.customerPhone ?? null,
            customerName: (order as { customerName?: string | null }).customerName ?? null,
            paymentMethod: (order as { paymentMethod?: string | null }).paymentMethod ?? null,
            fulfillment: (order as { fulfillment?: 'delivery' | 'pickup' | null }).fulfillment ?? null,
            externalUserId: extra?.externalUserId ?? null,
            source: extra?.source ?? null,
            createdAt: now,
            updatedAt: now,
          }
          return exists
            ? { orders: state.orders }
            : { orders: [newOrder, ...state.orders] }
        }),
      updateOrderStatus: (idOrCodigo, status, updatedAt) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === idOrCodigo || o.codigo === idOrCodigo
              ? { ...o, status, updatedAt: updatedAt ?? new Date().toISOString() }
              : o
          ),
        })),
      upsertOrders: (incoming) =>
        set((state) => {
          const byKey = (o: Order) => o.id ?? o.codigo ?? ''
          const map = new Map<string, Order>()
          for (const o of state.orders) {
            map.set(byKey(o), o)
          }
          for (const o of incoming) {
            map.set(byKey(o), { ...map.get(byKey(o)), ...o })
          }
          return { orders: Array.from(map.values()).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')) }
        }),
    }),
    { name: 'orders-storage' }
  )
)
