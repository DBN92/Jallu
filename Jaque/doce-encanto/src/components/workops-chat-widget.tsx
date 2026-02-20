import { useState } from "react"
import { MessageCircle, X, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { workopsAsk } from "@/lib/workops-agent"

type ChatMessage = {
  id: string
  from: "user" | "agent"
  text: string
}

export function WorkopsChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      from: "agent",
      text: "Olá! Posso ajudar com pedidos, status de encomendas e dúvidas sobre os produtos.",
    },
  ])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)

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
      const reply = await workopsAsk(trimmed)
      const agentMessage: ChatMessage = {
        id: `${Date.now()}-agent`,
        from: "agent",
        text: reply,
      }
      setMessages((prev) => [...prev, agentMessage])
    } catch (error) {
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                Assistente Jallu
              </p>
              <p className="text-xs text-muted-foreground">
                Online para ajudar você
              </p>
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
                  {message.text}
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
              placeholder="Escreva sua mensagem..."
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
        className="h-12 w-12 rounded-full shadow-xl bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={handleToggle}
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    </div>
  )
}

