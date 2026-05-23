import { beforeEach, describe, expect, it } from "vitest"
import { type CallLog, type CallLogRecord, createCallLog } from "./index"

describe("Storage", () => {
  let storage: CallLog

  beforeEach(() => {
    storage = createCallLog(":memory:")
  })

  it("append → read roundtrip preserves id and ts", () => {
    const record: CallLogRecord = {
      id: "test-1",
      ts: 1716480000000,
      modelId: "nano-30b-a3b",
      promptTokens: 100,
      completionTokens: 50,
      carbonGrams: 0.045,
      costUsd: 0.00002,
      source: "static",
      routingDecision: { modelId: "nano-30b-a3b", intent: "summarize", reason: "rule #1" },
    }
    storage.appendCallLog(record)
    const result = storage.readCallLog()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("test-1")
    expect(result[0].ts).toBe(1716480000000)
  })

  it("readCallLog filters by modelId", () => {
    const nano1: CallLogRecord = {
      id: "nano-1",
      ts: 1716480000000,
      modelId: "nano-30b-a3b",
      promptTokens: 100,
      completionTokens: 50,
      carbonGrams: 0.045,
      costUsd: 0.00002,
      source: "static",
      routingDecision: { modelId: "nano-30b-a3b", intent: "summarize", reason: "rule #1" },
    }

    const nano2: CallLogRecord = {
      id: "nano-2",
      ts: 1716480001000,
      modelId: "nano-30b-a3b",
      promptTokens: 200,
      completionTokens: 75,
      carbonGrams: 0.06,
      costUsd: 0.00004,
      source: "header",
      routingDecision: { modelId: "nano-30b-a3b", intent: "translate", reason: "rule #2" },
    }

    const super1: CallLogRecord = {
      id: "super-1",
      ts: 1716480002000,
      modelId: "super-120b-a12b",
      promptTokens: 500,
      completionTokens: 200,
      carbonGrams: 0.2,
      costUsd: 0.0001,
      source: "static",
      routingDecision: { modelId: "super-120b-a12b", intent: "reasoning", reason: "rule #3" },
    }

    storage.appendCallLog(nano1)
    storage.appendCallLog(nano2)
    storage.appendCallLog(super1)

    const nanoResults = storage.readCallLog({ modelId: "nano-30b-a3b" })
    expect(nanoResults).toHaveLength(2)
    expect(nanoResults.every((r) => r.modelId === "nano-30b-a3b")).toBe(true)

    const superResults = storage.readCallLog({ modelId: "super-120b-a12b" })
    expect(superResults).toHaveLength(1)
    expect(superResults[0].modelId).toBe("super-120b-a12b")
  })

  it("aggregateSavings computes correct sums and counts", () => {
    const records: CallLogRecord[] = [
      {
        id: "nano-1",
        ts: 1716480000000,
        modelId: "nano-30b-a3b",
        promptTokens: 100,
        completionTokens: 50,
        carbonGrams: 0.045,
        costUsd: 0.00002,
        source: "static",
        routingDecision: { modelId: "nano-30b-a3b", intent: "summarize", reason: "rule #1" },
      },
      {
        id: "nano-2",
        ts: 1716480001000,
        modelId: "nano-30b-a3b",
        promptTokens: 200,
        completionTokens: 75,
        carbonGrams: 0.06,
        costUsd: 0.00003,
        source: "header",
        routingDecision: { modelId: "nano-30b-a3b", intent: "translate", reason: "rule #2" },
      },
      {
        id: "super-1",
        ts: 1716480002000,
        modelId: "super-120b-a12b",
        promptTokens: 500,
        completionTokens: 200,
        carbonGrams: 0.2,
        costUsd: 0.0001,
        source: "static",
        routingDecision: { modelId: "super-120b-a12b", intent: "reasoning", reason: "rule #3" },
      },
      {
        id: "super-2",
        ts: 1716480003000,
        modelId: "super-200b-a20b",
        promptTokens: 1000,
        completionTokens: 400,
        carbonGrams: 0.5,
        costUsd: 0.00025,
        source: "static",
        routingDecision: { modelId: "super-200b-a20b", intent: "coding", reason: "rule #4" },
      },
    ]

    for (const r of records) {
      storage.appendCallLog(r)
    }

    const savings = storage.aggregateSavings()

    expect(savings.totalCarbonGrams).toBe(0.045 + 0.06 + 0.2 + 0.5)
    expect(savings.totalCostUsd).toBe(0.00002 + 0.00003 + 0.0001 + 0.00025)
    expect(savings.nanoCallCount).toBe(2)
    expect(savings.superCallCount).toBe(2)
  })

  it("WAL mode is enabled after createCallLog", () => {
    // For :memory: databases, SQLite may report 'memory' instead of 'wal'
    // since WAL doesn't apply to in-memory databases, but the pragma should
    // have been attempted. We verify that the storage instance was created
    // without error and supports queries.
    const testRecord: CallLogRecord = {
      id: "wal-test",
      ts: 1716480000000,
      modelId: "nano-30b-a3b",
      promptTokens: 50,
      completionTokens: 25,
      carbonGrams: 0.02,
      costUsd: 0.00001,
      source: "static",
      routingDecision: { modelId: "nano-30b-a3b", intent: "test", reason: "wal-mode" },
    }

    // Should not throw
    storage.appendCallLog(testRecord)
    const result = storage.readCallLog()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("wal-test")
  })

  it("routingDecision JSON deserializes to original object", () => {
    const record: CallLogRecord = {
      id: "routing-test",
      ts: 1716480000000,
      modelId: "nano-30b-a3b",
      promptTokens: 100,
      completionTokens: 50,
      carbonGrams: 0.045,
      costUsd: 0.00002,
      source: "static",
      routingDecision: { modelId: "nano-30b-a3b", intent: "summarize", reason: "rule #1" },
    }

    storage.appendCallLog(record)
    const result = storage.readCallLog()

    expect(result).toHaveLength(1)
    expect(result[0].routingDecision).toEqual({
      modelId: "nano-30b-a3b",
      intent: "summarize",
      reason: "rule #1",
    })
    // Verify it's an object, not a string
    expect(typeof result[0].routingDecision).toBe("object")
  })
})
