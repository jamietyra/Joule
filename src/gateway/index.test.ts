import { describe, expect, it, vi } from "vitest"
import { AuthError } from "../inference/_real-adapter.js"
import { createGateway } from "./index"

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function makeMocks() {
  const mockRouting = {
    decide: vi.fn(async () => ({
      modelId: "nano-30b-a3b" as const,
      intent: "summarize" as const,
      reason: "rule #1",
    })),
  }

  const mockInference = {
    chat: vi.fn(async () => ({
      modelId: "nano-30b-a3b",
      content: "summary text",
      usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
      carbonHeaderGrams: undefined as number | undefined,
    })),
  }

  const mockCarbon = vi.fn(() => ({
    carbonGrams: 0.45,
    costUsd: 0.0002,
    source: "static" as const,
  }))

  const mockStorage = {
    appendCallLog: vi.fn(),
    readCallLog: vi.fn(),
    aggregateSavings: vi.fn(),
  }

  return { mockRouting, mockInference, mockCarbon, mockStorage }
}

const VALID_BODY = JSON.stringify({
  model: "any",
  messages: [{ role: "user", content: "summarize this" }],
})

const POST_HEADERS = { "Content-Type": "application/json" }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gateway", () => {
  // T1: valid OpenAI request → 200 + correct response shape
  it("Test 1: valid request → 200 with correct response shape", async () => {
    const { mockRouting, mockInference, mockCarbon, mockStorage } = makeMocks()

    const app = createGateway({
      routing: mockRouting,
      inference: mockInference,
      carbon: mockCarbon,
      storage: mockStorage,
    })

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: POST_HEADERS,
      body: VALID_BODY,
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.id).toMatch(/^chatcmpl-/)
    expect((json.choices as Array<{ message: { content: string } }>)[0].message.content).toBe(
      "summary text",
    )
    expect(json.model).toBe("nano-30b-a3b")
    expect(json.usage).toBeDefined()
  })

  // T2: schema invalid (messages missing) → 400
  it("Test 2: missing messages → 400 with error field", async () => {
    const { mockRouting, mockInference, mockCarbon, mockStorage } = makeMocks()

    const app = createGateway({
      routing: mockRouting,
      inference: mockInference,
      carbon: mockCarbon,
      storage: mockStorage,
    })

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: POST_HEADERS,
      body: JSON.stringify({ model: "x" }), // no messages
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.error).toBeDefined()
  })

  // T3: Crusoe call throws AuthError → 502
  it("Test 3: inference throws AuthError → 502 with error field", async () => {
    const { mockRouting, mockInference, mockCarbon, mockStorage } = makeMocks()

    mockInference.chat.mockRejectedValueOnce(new AuthError("invalid key"))

    const app = createGateway({
      routing: mockRouting,
      inference: mockInference,
      carbon: mockCarbon,
      storage: mockStorage,
    })

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: POST_HEADERS,
      body: VALID_BODY,
    })

    expect(res.status).toBe(502)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.error).toBeDefined()
  })

  // T4: storage throws → still 200 (non-blocking), console.error called
  it("Test 4: storage failure → 200 (pass-through), console.error called", async () => {
    const { mockRouting, mockInference, mockCarbon, mockStorage } = makeMocks()

    mockStorage.appendCallLog.mockImplementation(() => {
      throw new Error("DB write failed")
    })

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const app = createGateway({
      routing: mockRouting,
      inference: mockInference,
      carbon: mockCarbon,
      storage: mockStorage,
    })

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: POST_HEADERS,
      body: VALID_BODY,
    })

    expect(res.status).toBe(200)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  // T5: call ordering — decide → chat → measure → appendCallLog
  it("Test 5: call order is decide → chat → measure → appendCallLog", async () => {
    const callOrder: string[] = []

    const mockRouting = {
      decide: vi.fn(async () => {
        callOrder.push("decide")
        return { modelId: "nano-30b-a3b" as const, intent: "summarize" as const, reason: "rule #1" }
      }),
    }

    const mockInference = {
      chat: vi.fn(async () => {
        callOrder.push("chat")
        return {
          modelId: "nano-30b-a3b",
          content: "summary text",
          usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
          carbonHeaderGrams: undefined as number | undefined,
        }
      }),
    }

    const mockCarbon = vi.fn(() => {
      callOrder.push("measure")
      return { carbonGrams: 0.45, costUsd: 0.0002, source: "static" as const }
    })

    const mockStorage = {
      appendCallLog: vi.fn(() => {
        callOrder.push("append")
      }),
      readCallLog: vi.fn(),
      aggregateSavings: vi.fn(),
    }

    const app = createGateway({
      routing: mockRouting,
      inference: mockInference,
      carbon: mockCarbon,
      storage: mockStorage,
    })

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: POST_HEADERS,
      body: VALID_BODY,
    })

    // Validation happens before all of these (not spied separately)
    expect(res.status).toBe(200)
    expect(callOrder).toEqual(["decide", "chat", "measure", "append"])
  })
})
