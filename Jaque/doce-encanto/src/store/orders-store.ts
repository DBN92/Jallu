import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

const ALERTZY_ACCOUNT_KEY = import.meta.env.VITE_ALERTZY_ACCOUNT_KEY as string | undefined
const ALERTZY_GROUP = import.meta.env.VITE_ALERTZY_GROUP as string | undefined
const ADMIN_ORDERS_URL = import.meta.env.VITE_ADMIN_ORDERS_URL as string | undefined

export type OrderItem = {
  id?: string | null
  name?: string | null
  quantity?: number | null
  price?: number | null
  category?: string | null
}

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'processing'
  | 'completed'
  | 'unknown'

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
  shippingFee?: number | null
  zipCode?: string | null
  addressNumber?: string | null
  addressLine?: string | null
  externalUserId?: string | null
  source?: string | null
  createdAt?: string
  updatedAt?: string
}

type OrdersState = {
  orders: Order[]
  isLoading: boolean
  error: string | null
  
  fetchOrders: () => Promise<void>
  addOrderFromAgent: (order: Partial<Order>, extra?: { externalUserId?: string | null; source?: string | null }) => Promise<void>
  updateOrderStatus: (idOrCodigo: string, status: OrderStatus, updatedAt?: string) => Promise<void>
  upsertOrders: (orders: Order[]) => void // Mantido para compatibilidade, mas fetchOrders deve substituir
}

type OrderItemRow = {
  id: string | null
  product_name: string | null
  quantity: number | null
  price: number | null
  category: string | null
}

function generateCode6() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

async function sendAlertzyOrderNotification(order: Order) {
  if (!ALERTZY_ACCOUNT_KEY) return

  const title = `Novo pedido ${order.codigo ?? order.id ?? ''}`.trim()

  const itemsLines =
    order.items && order.items.length
      ? order.items
          .map((i) => `- ${i.quantity ?? 0}x ${i.name ?? ''}`)
          .join('\n')
      : ''

  const totalLine =
    typeof order.total === 'number'
      ? `Total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}`
      : ''

  const customerLine =
    order.customerName || order.customerPhone
      ? `Cliente: ${order.customerName ?? ''} ${order.customerPhone ? `(${order.customerPhone})` : ''}`.trim()
      : ''

  const fulfillment =
    order.fulfillment === 'delivery' ? 'Entrega' : order.fulfillment === 'pickup' ? 'Retirada' : ''

  const fulfillmentLine = fulfillment ? `Tipo: ${fulfillment}` : ''

  const messageParts = [
    customerLine,
    fulfillmentLine,
    totalLine,
    itemsLines ? 'Itens:' : '',
    itemsLines,
  ].filter(Boolean)

  const message = messageParts.join('\n')

  const adminUrl = ADMIN_ORDERS_URL || `${window.location.origin}/admin/mobile`

  const buttons = JSON.stringify([
    {
      text: 'Ver pedidos',
      link: adminUrl,
      color: 'success',
    },
  ])

  const body = new URLSearchParams()
  body.append('accountKey', ALERTZY_ACCOUNT_KEY)
  if (title) body.append('title', title)
  if (message) body.append('message', message)
  if (ALERTZY_GROUP) body.append('group', ALERTZY_GROUP)
  body.append('buttons', buttons)

  try {
    await fetch('https://alertzy.app/send', {
      method: 'POST',
      body,
    })
  } catch (err) {
    console.error('Erro ao enviar notificação Alertzy:', err)
  }
}

async function sendAlertzyStatusNotification(order: Order, nextStatus: OrderStatus) {
  if (!ALERTZY_ACCOUNT_KEY) return
  const statusPt: Record<OrderStatus, string> = {
    pending: 'Pendente',
    accepted: 'Aceito',
    processing: 'Em preparação',
    completed: 'Concluído',
    rejected: 'Rejeitado',
    unknown: 'Atualizado',
  }
  const title = `Pedido ${order.codigo ?? order.id ?? ''} atualizado`
  const messageParts = [
    `Novo status: ${statusPt[nextStatus] ?? 'Atualizado'}`,
    order.customerName || order.customerPhone
      ? `Cliente: ${order.customerName ?? ''} ${order.customerPhone ? `(${order.customerPhone})` : ''}`.trim()
      : '',
    typeof order.total === 'number'
      ? `Total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}`
      : '',
  ].filter(Boolean)
  const message = messageParts.join('\n')
  const adminUrl = ADMIN_ORDERS_URL || `${window.location.origin}/admin/mobile`
  const buttons = JSON.stringify([
    { text: 'Abrir modo mobile', link: adminUrl, color: 'success' },
  ])
  const body = new URLSearchParams()
  body.append('accountKey', ALERTZY_ACCOUNT_KEY)
  body.append('title', title)
  if (message) body.append('message', message)
  if (ALERTZY_GROUP) body.append('group', ALERTZY_GROUP)
  body.append('buttons', buttons)
  try {
    await fetch('https://alertzy.app/send', { method: 'POST', body })
  } catch (err) {
    console.error('Erro ao enviar notificação de status (Alertzy):', err)
  }
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      isLoading: false,
      error: null,

      fetchOrders: async () => {
        set({ isLoading: true, error: null })
        try {
          const { data, error } = await supabase
            .from('orders')
            .select(`
              *,
              items:order_items(*)
            `)
            .order('created_at', { ascending: false })

          if (error) throw error

          if (data) {
            const mappedOrders = data.map((o) => {
              const rawStatus = String(o.status ?? 'pending')
              let status: OrderStatus
              switch (rawStatus) {
                case 'preparing':
                  status = 'processing'
                  break
                case 'delivered':
                  status = 'completed'
                  break
                case 'canceled':
                  status = 'rejected'
                  break
                case 'pending':
                case 'accepted':
                case 'rejected':
                case 'processing':
                case 'completed':
                case 'unknown':
                  status = rawStatus as OrderStatus
                  break
                default:
                  status = 'unknown'
              }

              return {
                id: o.id,
                codigo: o.code,
                customerName: o.customer_name,
                customerPhone: o.customer_phone,
                status,
                total: Number(o.total),
                fulfillment: o.fulfillment as 'delivery' | 'pickup' | null,
                shippingFee: Number(o.shipping_fee),
                zipCode: o.zip_code,
                addressNumber: o.address_number,
                addressLine: o.address_line,
                paymentMethod: o.payment_method,
                source: o.source,
                externalUserId: o.external_user_id,
                createdAt: o.created_at,
                updatedAt: o.updated_at,
                items: (o.items as OrderItemRow[]).map((i) => ({
                  id: i.id,
                  name: i.product_name,
                  quantity: i.quantity,
                  price: Number(i.price),
                  category: i.category,
                })),
              }
            })
            set({ orders: mappedOrders })
          }
        } catch (err) {
          console.error('Erro ao buscar pedidos:', err)
          if (err instanceof Error) {
            set({ error: err.message })
          } else {
            set({ error: 'Erro ao buscar pedidos' })
          }
        } finally {
          set({ isLoading: false })
        }
      },

      addOrderFromAgent: async (order, extra) => {
          const now = new Date().toISOString()
          const incomingCode = String(order.codigo ?? order.id ?? '').toUpperCase()
          const codePattern = /^[A-Z0-9]{6}$/
          const finalCode = codePattern.test(incomingCode) ? incomingCode : generateCode6()
          
          // Usar finalCode como ID temporário se não tivermos UUID ainda
          const tempId = finalCode 
          
          const newOrder: Order = {
            id: tempId,
            codigo: finalCode,
            items: order.items ?? [],
            total: order.total ?? null,
            payment_link: order.payment_link ?? null,
            status: 'pending',
            customerPhone: order.customerPhone ?? null,
            customerName: order.customerName ?? null,
            paymentMethod: order.paymentMethod ?? null,
            fulfillment: order.fulfillment ?? null,
            shippingFee: order.shippingFee ?? null,
            zipCode: order.zipCode ?? null,
            addressNumber: order.addressNumber ?? null,
            addressLine: order.addressLine ?? null,
            externalUserId: extra?.externalUserId ?? null,
            source: extra?.source ?? null,
            createdAt: now,
            updatedAt: now,
          }

          // Optimistic UI
          set((state) => ({ orders: [newOrder, ...state.orders] }))
          
          try {
             const { data: orderData, error: orderError } = await supabase
               .from('orders')
               .insert([{
                  code: finalCode,
                  customer_name: newOrder.customerName,
                  customer_phone: newOrder.customerPhone,
                  status: 'pending',
                  total: newOrder.total || 0,
                  fulfillment: newOrder.fulfillment,
                  shipping_fee: newOrder.shippingFee || 0,
                  zip_code: newOrder.zipCode,
                  address_number: newOrder.addressNumber,
                  address_line: newOrder.addressLine,
                  source: newOrder.source,
                  external_user_id: newOrder.externalUserId,
                  payment_method: newOrder.paymentMethod
               }])
               .select()
               .single()
             
             if (orderError) throw orderError
             
             if (newOrder.items && newOrder.items.length > 0 && orderData) {
                const itemsPayload = newOrder.items.map((i) => ({
                   order_id: orderData.id,
                   product_name: i.name,
                   quantity: i.quantity,
                   price: i.price,
                   category: i.category
                }))
                
                const { error: itemsError } = await supabase
                  .from('order_items')
                  .insert(itemsPayload)
                
                if (itemsError) throw itemsError
             }
             
             // Atualizar ID local com UUID real
             if (orderData) {
                set((state) => ({
                   orders: state.orders.map((o) => o.id === tempId ? { ...o, id: orderData.id } : o)
                }))
             }

             await sendAlertzyOrderNotification({
               ...newOrder,
               id: orderData?.id ?? newOrder.id,
             })

          } catch (err) {
             console.error('Erro ao salvar pedido no Supabase:', err)
             // Mantém localmente graças ao persist
          }
      },

      updateOrderStatus: async (idOrCodigo, status, updatedAt) => {
        const now = updatedAt ?? new Date().toISOString()

        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === idOrCodigo || o.codigo === idOrCodigo
              ? { ...o, status, updatedAt: now }
              : o
          ),
        }))

        try {
          let targetId = idOrCodigo
          if (!idOrCodigo.match(/^[0-9a-f]{8}-/)) {
            const { data } = await supabase
              .from('orders')
              .select('id')
              .eq('code', idOrCodigo)
              .single()
            if (data) targetId = data.id
          }

          const dbStatus =
            status === 'processing'
              ? 'preparing'
              : status === 'completed'
              ? 'delivered'
              : status === 'unknown'
              ? 'pending'
              : status

          const { error } = await supabase
            .from('orders')
            .update({ status: dbStatus, updated_at: now })
            .eq('id', targetId)

          if (error) throw error
          
          // Notificação de alteração de status
          const current = get().orders.find((o) => o.id === idOrCodigo || o.codigo === idOrCodigo)
          if (current) {
            try {
              await sendAlertzyStatusNotification({ ...current, status }, status)
            } catch (e) {
              console.warn('Falha ao enviar push de status:', e)
            }
          }
        } catch (err) {
          console.error('Erro ao atualizar status no Supabase:', err)
        }
      },

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
    { name: 'orders-storage-v2' }
  )
)
