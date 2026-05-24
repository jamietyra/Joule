import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type CallLogRecord, createCallLog } from "../src/storage/index"
import { executeTool, renderToolCatalog, TOOLS } from "./_tools"

function seedSample(dbPath: string) {
  const storage = createCallLog(dbPath)
  const base: Omit<CallLogRecord, "id" | "ts" | "modelId" | "costUsd" | "carbonGrams"> = {
    promptTokens: 100,
    completionTokens: 50,
    source: "static",
    routingDecision: { modelId: "", intent: "summarize", reason: "" },
  }
  storage.appendCallLog({
    ...base,
    id: "a",
    ts: 1,
    modelId: "nano-30b-a3b",
    costUsd: 0.0002,
    carbonGrams: 0.45,
  } as CallLogRecord)
  storage.appendCallLog({
    ...base,
    id: "b",
    ts: 2,
    modelId: "nano-30b-a3b",
    costUsd: 0.0004,
    carbonGrams: 0.9,
  } as CallLogRecord)
  storage.appendCallLog({
    ...base,
    id: "c",
    ts: 3,
    modelId: "super-120b-a12b",
    costUsd: 0.0024,
    carbonGrams: 4.2,
  } as CallLogRecord)
  storage.appendCallLog({
    ...base,
    id: "d",
    ts: 4,
    modelId: "super-120b-a12b",
    costUsd: 0.0048,
    carbonGrams: 8.4,
  } as CallLogRecord)
}

describe("Hermes tools", () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "hermes-tools-"))
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

  it("getAggregateSavings returns sums and counts", async () => {
    const r = await executeTool("getAggregateSavings", {}, { dbPath })
    expect(r.kind).toBe("aggregateSavings")
    if (r.kind !== "aggregateSavings") return
    expect(r.totalCalls).toBe(4)
    expect(r.nanoCallCount).toBe(2)
    expect(r.superCallCount).toBe(2)
    expect(r.totalCostUsd).toBeCloseTo(0.0078, 6)
  })

  it("getTopCalls returns N highest-cost calls", async () => {
    const r = await executeTool("getTopCalls", { n: 2 }, { dbPath })
    expect(r.kind).toBe("topCalls")
    if (r.kind !== "topCalls") return
    expect(r.n).toBe(2)
    expect(r.calls).toHaveLength(2)
    expect(r.calls[0]!.id).toBe("d")
    expect(r.calls[1]!.id).toBe("c")
  })

  it("getTopCalls caps n at 10", async () => {
    const r = await executeTool("getTopCalls", { n: 999 }, { dbPath })
    if (r.kind !== "topCalls") throw new Error("wrong kind")
    expect(r.n).toBe(10)
  })

  it("getModelMix returns ratios", async () => {
    const r = await executeTool("getModelMix", {}, { dbPath })
    if (r.kind !== "modelMix") throw new Error("wrong kind")
    expect(r.superRatio).toBeCloseTo(0.5)
    expect(r.nanoRatio).toBeCloseTo(0.5)
    expect(r.totalCalls).toBe(4)
  })

  it("generateReport writes HTML file and returns path", async () => {
    const output = join(tmpDir, "report.html")
    const r = await executeTool("generateReport", { output }, { dbPath })
    if (r.kind !== "generateReport") throw new Error("wrong kind")
    expect(existsSync(output)).toBe(true)
    expect(r.htmlBytes).toBeGreaterThan(100)
    const html = readFileSync(output, "utf-8")
    expect(html).toContain("Top 3 호출")
  })

  it("sendWeeklyReport with HERMES_FORCE_DRY_RUN=true falls back to dry-run", async () => {
    const orig = process.env.HERMES_FORCE_DRY_RUN
    process.env.HERMES_FORCE_DRY_RUN = "true"
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      const r = await executeTool("sendWeeklyReport", { to: "demo@example.com" }, { dbPath })
      if (r.kind !== "sendWeeklyReport") throw new Error("wrong kind")
      expect(r.mode).toBe("dry-run")
      expect(r.to).toBe("demo@example.com")
    } finally {
      if (orig === undefined) delete process.env.HERMES_FORCE_DRY_RUN
      else process.env.HERMES_FORCE_DRY_RUN = orig
      consoleSpy.mockRestore()
    }
  })

  it("renderToolCatalog produces a non-empty string with all 5 tool names", () => {
    const s = renderToolCatalog()
    for (const t of TOOLS) {
      expect(s).toContain(t.name)
    }
    expect(s.length).toBeGreaterThan(200)
  })
})
