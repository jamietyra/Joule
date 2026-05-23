export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatRequest {
  modelId: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface InferenceResult {
  modelId: string
  content: string // assistant reply
  usage: TokenUsage
  carbonHeaderGrams: number | undefined // X-Carbon-grams header value (undefined if Crusoe doesn't send it)
}

export interface CrusoeInferenceClient {
  chat(req: ChatRequest): Promise<InferenceResult>
}

import { createRealAdapter } from "./_real-adapter.js"

export function createFromEnv(): CrusoeInferenceClient {
  const apiKey = process.env.CRUSOE_API_KEY
  const baseUrl = process.env.CRUSOE_BASE_URL ?? "https://api.inference.crusoecloud.com/v1"
  if (!apiKey) {
    throw new Error("CRUSOE_API_KEY env var missing (see .env.example)")
  }
  return createRealAdapter({ apiKey, baseUrl })
}

// Re-export error subtypes so callers can catch them
export {
  AuthError,
  CrusoeError,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
} from "./_real-adapter.js"

export interface MockScenario {
  // Matches when the LAST user message content contains `userMessageContains`.
  userMessageContains: string
  // Response content the mock returns.
  responseContent: string
  // Token usage to report.
  usage: TokenUsage
  // Optional X-Carbon-grams header value (undefined = Crusoe didn't send it).
  carbonHeaderGrams?: number | undefined
}

export { createMock } from "./_mock-adapter.js"
