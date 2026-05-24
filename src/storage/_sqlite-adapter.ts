import Database from "better-sqlite3"
import type { CallLogRecord } from "./index"

// Schema inlined to avoid import.meta.url issues when bundled by Next.js
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS call_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  carbon_grams REAL,
  cost_usd REAL,
  source TEXT,
  routing_decision TEXT,
  persona_tag TEXT
);

CREATE INDEX IF NOT EXISTS idx_call_log_model_id ON call_log(model_id);
`

interface AggregateResult {
  totalCarbonGrams: number
  totalCostUsd: number
  superCallCount: number
  nanoCallCount: number
}

interface DbRow {
  id: string
  ts: number
  model_id: string
  prompt_tokens: number | null
  completion_tokens: number | null
  carbon_grams: number | null
  cost_usd: number | null
  source: string | null
  routing_decision: string | null
  persona_tag: string | null
}

interface AggregateRow {
  superCallCount: number | null
  nanoCallCount: number | null
}

export interface SqliteAdapter {
  insert(record: CallLogRecord): void
  selectAll(filter?: { modelId?: string }): CallLogRecord[]
  aggregate(): AggregateResult
}

function rowToRecord(row: DbRow): CallLogRecord {
  return {
    id: row.id,
    ts: row.ts,
    modelId: row.model_id,
    promptTokens: row.prompt_tokens ?? 0,
    completionTokens: row.completion_tokens ?? 0,
    carbonGrams: row.carbon_grams ?? 0,
    costUsd: row.cost_usd ?? 0,
    source: (row.source ?? "static") as "static" | "header",
    routingDecision: JSON.parse(row.routing_decision ?? "{}") as {
      modelId: string
      intent: string
      reason: string
    },
    personaTag: row.persona_tag ?? undefined,
  }
}

export function createSqliteAdapter(dbPath: string): SqliteAdapter {
  const schemaSql = SCHEMA_SQL

  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.exec(schemaSql)

  const stmtInsert = db.prepare<
    [string, number, string, number, number, number, number, string, string, string | null]
  >(
    `INSERT INTO call_log
      (id, ts, model_id, prompt_tokens, completion_tokens,
       carbon_grams, cost_usd, source, routing_decision, persona_tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const stmtSelectAll = db.prepare<[], DbRow>("SELECT * FROM call_log")
  const stmtSelectByModel = db.prepare<[string], DbRow>("SELECT * FROM call_log WHERE model_id = ?")

  const stmtAggregate = db.prepare<[], AggregateRow>(
    `SELECT
       SUM(CASE WHEN model_id LIKE 'super-%' THEN 1 ELSE 0 END) AS superCallCount,
       SUM(CASE WHEN model_id LIKE 'nano-%'  THEN 1 ELSE 0 END) AS nanoCallCount
     FROM call_log`,
  )

  // Fetch individual rows for float sums to match JS floating-point arithmetic
  const stmtSelectForSum = db.prepare<[], { carbon_grams: number | null; cost_usd: number | null }>(
    "SELECT carbon_grams, cost_usd FROM call_log",
  )

  return {
    insert(record: CallLogRecord): void {
      stmtInsert.run(
        record.id,
        record.ts,
        record.modelId,
        record.promptTokens,
        record.completionTokens,
        record.carbonGrams,
        record.costUsd,
        record.source,
        JSON.stringify(record.routingDecision),
        record.personaTag ?? null,
      )
    },

    selectAll(filter?: { modelId?: string }): CallLogRecord[] {
      if (filter?.modelId !== undefined) {
        return (stmtSelectByModel.all(filter.modelId) as DbRow[]).map(rowToRecord)
      }
      return (stmtSelectAll.all() as DbRow[]).map(rowToRecord)
    },

    aggregate(): AggregateResult {
      const row = stmtAggregate.get() as AggregateRow
      const sumRows = stmtSelectForSum.all() as {
        carbon_grams: number | null
        cost_usd: number | null
      }[]
      let totalCarbonGrams = 0
      let totalCostUsd = 0
      for (const r of sumRows) {
        totalCarbonGrams += r.carbon_grams ?? 0
        totalCostUsd += r.cost_usd ?? 0
      }
      return {
        totalCarbonGrams,
        totalCostUsd,
        superCallCount: Number(row.superCallCount ?? 0),
        nanoCallCount: Number(row.nanoCallCount ?? 0),
      }
    },
  }
}
