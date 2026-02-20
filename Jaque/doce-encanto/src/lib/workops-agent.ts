const WORKOPS_AGENT_URL =
  "https://xwcwklsszcekbkpgqfzr.supabase.co/functions/v1/agent-public-chat"

const WORKOPS_INGEST_URL =
  "https://xwcwklsszcekbkpgqfzr.supabase.co/functions/v1/ecommerce-ingest"

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

const WORKOPS_TOKEN = import.meta.env.VITE_WORKOPS_AGENT_TOKEN as string | undefined

if (!WORKOPS_TOKEN) {
  // Mantém falha explícita em desenvolvimento se o token não estiver configurado
  // O token deve ser definido em .env.local como VITE_WORKOPS_AGENT_TOKEN
  console.warn("[WorkOps] VITE_WORKOPS_AGENT_TOKEN não configurado")
}

export async function workopsAsk(
  message: string,
  externalUserId?: string | null,
  context?: JsonValue | null
): Promise<string> {
  if (!WORKOPS_TOKEN) {
    throw new Error("Token do WorkOps não configurado (VITE_WORKOPS_AGENT_TOKEN)")
  }

  const resp = await fetch(WORKOPS_AGENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: WORKOPS_TOKEN,
      message,
      externalUserId: externalUserId || null,
      context: context ?? null,
    }),
  })

  const json = await resp.json()

  if (!resp.ok || !json.success) {
    throw new Error(json.error || "Falha no agente")
  }

  return json.message as string
}

export async function workopsIngest(
  eventType: string,
  payload?: JsonValue,
  externalUserId?: string | null,
  externalId?: string | null
): Promise<string> {
  if (!WORKOPS_TOKEN) {
    throw new Error("Token do WorkOps não configurado (VITE_WORKOPS_AGENT_TOKEN)")
  }

  const resp = await fetch(WORKOPS_INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: WORKOPS_TOKEN,
      source: "ecommerce",
      eventType,
      externalUserId: externalUserId || null,
      externalId: externalId || null,
      payload: payload ?? {},
    }),
  })

  const json = await resp.json()

  if (!resp.ok || !json.success) {
    throw new Error(json.error || "Falha ao ingerir evento")
  }

  return json.id as string
}
