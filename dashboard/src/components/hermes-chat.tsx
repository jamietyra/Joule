"use client"
import { useEffect, useRef, useState } from "react"

interface ChatMessage {
  id: string
  role: "user" | "assistant" | "error"
  text: string
  toolUsed?: string | null
}

const EXAMPLE_PROMPTS = [
  "How much did we save this week?",
  "What are the top 3 most expensive calls?",
  "What's the Super vs Nano ratio?",
  "Generate the weekly report",
]

export function HermesChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every message/loading change is intentional
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: trimmed }])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
        cache: "no-store",
      })
      const data = (await res.json()) as {
        answer?: string
        toolUsed?: string | null
        error?: string
      }
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { id: `e-${Date.now()}`, role: "error", text: data.error ?? `HTTP ${res.status}` },
        ])
      } else {
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: data.answer ?? "(empty response)",
            toolUsed: data.toolUsed ?? null,
          },
        ])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: "error", text: `Network error: ${msg}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    send(input)
  }

  return (
    <section
      data-component="hermes-chat"
      style={{
        marginTop: 24,
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2563eb, #10b981)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          H
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Hermes Agent</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Routed through Joule itself — agent measures its own carbon
          </div>
        </div>
      </div>

      {/* Message list */}
      <div
        style={{
          minHeight: 120,
          maxHeight: 320,
          overflowY: "auto",
          padding: 12,
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        {messages.length === 0 && !loading && (
          <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: 16 }}>
            Ask in natural language. Or tap an example below.
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            data-role={m.role}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "78%",
                padding: "8px 12px",
                borderRadius: 10,
                background:
                  m.role === "user" ? "#2563eb" : m.role === "error" ? "#fee2e2" : "#f3f4f6",
                color: m.role === "user" ? "white" : m.role === "error" ? "#991b1b" : "#111827",
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
              {m.role === "assistant" && m.toolUsed && (
                <div
                  data-tool-badge={m.toolUsed}
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: "#6b7280",
                    display: "inline-block",
                    padding: "2px 6px",
                    background: "#e5e7eb",
                    borderRadius: 4,
                  }}
                >
                  🔧 {m.toolUsed}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div data-loading="1" style={{ color: "#6b7280", fontSize: 13, paddingLeft: 6 }}>
            Hermes is thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Example prompt chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => send(p)}
            disabled={loading}
            data-prompt-chip={p}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 999,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: loading ? "not-allowed" : "pointer",
              color: "#374151",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask in natural language..."
          disabled={loading}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: "8px 16px",
            background: loading || !input.trim() ? "#9ca3af" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {loading ? "..." : "Send"}
        </button>
      </form>
    </section>
  )
}
