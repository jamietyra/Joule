export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

export interface OpenAIChatRequest {
  model: string
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  temperature?: number
  max_tokens?: number
}

export function validateChatRequest(raw: unknown): OpenAIChatRequest {
  if (typeof raw !== "object" || raw === null) {
    throw new ValidationError("request body must be a JSON object")
  }
  const obj = raw as Record<string, unknown>

  if (typeof obj.model !== "string") {
    throw new ValidationError('field "model" missing or not a string')
  }
  if (!Array.isArray(obj.messages)) {
    throw new ValidationError('field "messages" missing or not an array')
  }
  if (obj.messages.length === 0) {
    throw new ValidationError('field "messages" must not be empty')
  }
  for (const m of obj.messages) {
    if (typeof m !== "object" || m === null) {
      throw new ValidationError("each message must be an object")
    }
    const msg = m as Record<string, unknown>
    if (msg.role !== "system" && msg.role !== "user" && msg.role !== "assistant") {
      throw new ValidationError("each message must have role: system|user|assistant")
    }
    if (typeof msg.content !== "string") {
      throw new ValidationError("each message must have content: string")
    }
  }

  return {
    model: obj.model,
    messages: obj.messages as OpenAIChatRequest["messages"],
    temperature: typeof obj.temperature === "number" ? obj.temperature : undefined,
    max_tokens: typeof obj.max_tokens === "number" ? obj.max_tokens : undefined,
  }
}
