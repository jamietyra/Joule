import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { type CallLogRecord, createCallLog } from "../src/storage/index"
import { type ChatLlm, createAgent, parsePlannerOutput } from "./_agent"

function seedSample(dbPath: string) {
  const s = createCallLog(dbPath)
  const base = {
    promptTokens: 100,
    completionTokens: 50,
    source: "static" as const,
    routingDecision: { modelId: "", intent: "summarize", reason: "" },
  }
  s.appendCallLog({
    ...base,
    id: "a",
    ts: 1,
    modelId: "nano-30b-a3b",
    costUsd: 0.0002,
    carbonGrams: 0.45,
  } as CallLogRecord)
  s.appendCallLog({
    ...base,
    id: "b",
    ts: 2,
    modelId: "super-120b-a12b",
    costUsd: 0.0024,
    carbonGrams: 4.2,
  } as CallLogRecord)
}

function makeMockLlm(scripted: string[]): ChatLlm {
  let i = 0
  return {
    async chat() {
      const out = scripted[i] ?? ""
      i++
      return out
    },
  }
}

describe("Hermes agent", () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "hermes-agent-"))
    dbPath = join(tmpDir, "test.db")
    seedSample(dbPath)
  })

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* Windows EBUSY */
    }
  })

  it("planner output: clean JSON parses correctly", () => {
    const d = parsePlannerOutput('{"tool":"getAggregateSavings","args":{}}')
    expect(d.tool).toBe("getAggregateSavings")
    expect(d.args).toEqual({})
  })

  it("planner output: JSON wrapped in markdown fence is extracted", () => {
    const d = parsePlannerOutput('```json\n{"tool":"getTopCalls","args":{"n":3}}\n```')
    expect(d.tool).toBe("getTopCalls")
    expect(d.args.n).toBe(3)
  })

  it("planner output: invalid tool name → null", () => {
    const d = parsePlannerOutput('{"tool":"deleteEverything","args":{}}')
    expect(d.tool).toBe(null)
  })

  it("planner output: malformed JSON → null fallback", () => {
    const d = parsePlannerOutput("not json at all")
    expect(d.tool).toBe(null)
  })

  it('agent routes "이번 주 절감" → getAggregateSavings → Korean summary', async () => {
    const llm = makeMockLlm([
      '{"tool":"getAggregateSavings","args":{}}',
      "이번 주 누적 절감은 CO₂ 4.65g, 비용 $0.0026 입니다. 총 2건 호출 (Nano 1, Super 1).",
    ])
    const agent = createAgent({ llm, context: { dbPath } })
    const r = await agent.ask("이번 주 절감 얼마야?")
    expect(r.toolUsed).toBe("getAggregateSavings")
    expect(r.toolResult?.kind).toBe("aggregateSavings")
    expect(r.answer).toContain("절감")
  })

  it('agent routes "Top 1 비싼 호출" → getTopCalls(n=1)', async () => {
    const llm = makeMockLlm([
      '{"tool":"getTopCalls","args":{"n":1}}',
      "가장 비쌌던 호출은 super-120b-a12b 모델로 $0.0024 (CO₂ 4.2g).",
    ])
    const agent = createAgent({ llm, context: { dbPath } })
    const r = await agent.ask("Top 1 비싼 호출은?")
    expect(r.toolUsed).toBe("getTopCalls")
    if (r.toolResult?.kind === "topCalls") {
      expect(r.toolResult.n).toBe(1)
      expect(r.toolResult.calls).toHaveLength(1)
      expect(r.toolResult.calls[0]!.modelId).toBe("super-120b-a12b")
    }
  })

  it("agent falls back to direct answer when planner returns null", async () => {
    const llm = makeMockLlm([
      '{"tool":null,"args":{}}',
      "안녕하세요! Joule 에 대해 무엇이든 물어보세요.",
    ])
    const agent = createAgent({ llm, context: { dbPath } })
    const r = await agent.ask("안녕")
    expect(r.toolUsed).toBe(null)
    expect(r.toolResult).toBe(null)
    expect(r.answer).toContain("안녕")
  })

  it("agent recovers when tool throws (returns error message in answer)", async () => {
    const llm = makeMockLlm([
      '{"tool":"sendWeeklyReport","args":{"to":"test@example.com"}}',
      // responder shouldn't be called since tool throws
    ])
    // Force real path with missing env vars
    const oldUser = process.env.GMAIL_USER
    const oldPass = process.env.GMAIL_APP_PASSWORD
    const oldForce = process.env.HERMES_FORCE_DRY_RUN
    delete process.env.GMAIL_USER
    delete process.env.GMAIL_APP_PASSWORD
    delete process.env.HERMES_FORCE_DRY_RUN
    try {
      const agent = createAgent({ llm, context: { dbPath } })
      const r = await agent.ask("test@example.com 으로 리포트 보내")
      expect(r.toolUsed).toBe("sendWeeklyReport")
      expect(r.toolResult).toBe(null)
      expect(r.answer).toContain("오류")
    } finally {
      if (oldUser !== undefined) process.env.GMAIL_USER = oldUser
      if (oldPass !== undefined) process.env.GMAIL_APP_PASSWORD = oldPass
      if (oldForce !== undefined) process.env.HERMES_FORCE_DRY_RUN = oldForce
    }
  })
})
