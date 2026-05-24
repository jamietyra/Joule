import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type CallLogRecord, createCallLog } from "../src/storage/index"
import { composeWeeklyReportHtml } from "./_compose"
import { runWeeklyReport } from "./index"

const sample: CallLogRecord = {
  id: "t",
  ts: 1716480000000,
  modelId: "super-120b-a12b",
  promptTokens: 500,
  completionTokens: 200,
  carbonGrams: 2.94,
  costUsd: 0.00168,
  source: "static",
  routingDecision: { modelId: "super-120b-a12b", intent: "code", reason: "" },
}

describe("Hermes report composition", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })
  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it("HTML has 3 block headers + recommendation", () => {
    const html = composeWeeklyReportHtml({
      summary: {
        totalCarbonGrams: 10,
        totalCostUsd: 0.05,
        superCallCount: 3,
        nanoCallCount: 7,
        totalCalls: 10,
      },
      top3: [sample],
    })
    expect(html).toContain("누적 절감")
    expect(html).toContain("Top 3 호출")
    expect(html).toContain("권장 액션")
    expect(html).toMatch(/Nano 비중/)
  })

  it("Top 3 sorted by cost desc", () => {
    const records: CallLogRecord[] = [
      { ...sample, id: "a", costUsd: 0.001 },
      { ...sample, id: "b", costUsd: 0.005 },
      { ...sample, id: "c", costUsd: 0.003 },
    ]
    // Verify the sort happens in composeWeeklyReportHtml's top3 input order
    const sortedTop3 = [...records].sort((a, b) => b.costUsd - a.costUsd).slice(0, 3)
    expect(sortedTop3.map((r) => r.id)).toEqual(["b", "c", "a"])
    const html = composeWeeklyReportHtml({
      summary: {
        totalCarbonGrams: 0,
        totalCostUsd: 0,
        superCallCount: 3,
        nanoCallCount: 0,
        totalCalls: 3,
      },
      top3: sortedTop3,
    })
    // 'b' appears before 'c' in HTML (it's the largest cost)
    const idxB = html.indexOf("0.00500")
    const idxC = html.indexOf("0.00300")
    const idxA = html.indexOf("0.00100")
    expect(idxB).toBeLessThan(idxC)
    expect(idxC).toBeLessThan(idxA)
  })

  it("runWeeklyReport with --dry-run writes HTML file containing Top 3", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hermes-cli-"))
    const dbPath = join(tmpDir, "test.db")
    const outputPath = join(tmpDir, "preview.html")

    // Seed DB
    const storage = createCallLog(dbPath)
    storage.appendCallLog({ ...sample, id: "r1", costUsd: 0.01 })
    storage.appendCallLog({ ...sample, id: "r2", costUsd: 0.005 })

    await runWeeklyReport({
      subcommand: "run",
      reportType: "weekly-report",
      dryRun: true,
      db: dbPath,
      to: "test@example.com",
      output: outputPath,
      baseUrl: null,
      question: null,
    })

    expect(existsSync(outputPath)).toBe(true)
    const html = readFileSync(outputPath, "utf-8")
    expect(html).toContain("Top 3 호출")

    // Windows: better-sqlite3 keeps the file handle open until GC.
    // rmSync with force:true silently skips locked files on Windows.
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore EBUSY on Windows */
    }
  })
})
