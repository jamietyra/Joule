import { resolve } from "node:path"
import Database from "better-sqlite3"

export interface CallLogRecord {
  id: string
  ts: number
  modelId: string
  promptTokens: number
  completionTokens: number
  carbonGrams: number
  costUsd: number
  source: "static" | "header"
  routingDecision: { modelId: string; intent: string; reason: string }
  personaTag?: string
}

export interface AggregateResult {
  totalCarbonGrams: number
  totalCostUsd: number
  superCallCount: number
  nanoCallCount: number
}

interface DbRow {
  id: string
  ts: number
  model_id: string
  prompt_tokens: number
  completion_tokens: number
  carbon_grams: number
  cost_usd: number
  source: string
  routing_decision: string | null
  persona_tag: string | null
}

function rowToRecord(row: DbRow): CallLogRecord {
  return {
    id: row.id,
    ts: row.ts,
    modelId: row.model_id,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    carbonGrams: row.carbon_grams,
    costUsd: row.cost_usd,
    source: row.source === "header" ? "header" : "static",
    routingDecision: row.routing_decision
      ? JSON.parse(row.routing_decision)
      : { modelId: row.model_id, intent: "other", reason: "" },
    personaTag: row.persona_tag ?? undefined,
  }
}

function getDbPath(): string {
  // Allow env override; otherwise resolve to joule.db at the JOULE REPO ROOT
  // (one level up from dashboard/). Used by dashboard server components/API routes.
  if (process.env.JOULE_DB_PATH) return process.env.JOULE_DB_PATH
  return resolve(process.cwd(), "..", "joule.db")
}

export function openReadOnly() {
  const db = new Database(getDbPath(), { readonly: true, fileMustExist: false })
  return db
}

export function readLatest(limit = 1): CallLogRecord[] {
  const db = openReadOnly()
  try {
    const rows = db.prepare("SELECT * FROM call_log ORDER BY ts DESC LIMIT ?").all(limit) as DbRow[]
    return rows.map(rowToRecord)
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [] // DB hasn't been initialized yet — return empty rather than crash
    }
    throw err
  } finally {
    db.close()
  }
}

export function readAll(): CallLogRecord[] {
  const db = openReadOnly()
  try {
    const rows = db.prepare("SELECT * FROM call_log ORDER BY ts ASC").all() as DbRow[]
    return rows.map(rowToRecord)
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) return []
    throw err
  } finally {
    db.close()
  }
}

export function aggregateSavings(): AggregateResult {
  const db = openReadOnly()
  try {
    const rows = db
      .prepare("SELECT carbon_grams, cost_usd, model_id FROM call_log")
      .all() as Array<{ carbon_grams: number; cost_usd: number; model_id: string }>
    let totalCarbonGrams = 0
    let totalCostUsd = 0
    let superCallCount = 0
    let nanoCallCount = 0
    for (const r of rows) {
      totalCarbonGrams += r.carbon_grams || 0
      totalCostUsd += r.cost_usd || 0
      if (r.model_id.startsWith("super-")) superCallCount++
      else if (r.model_id.startsWith("nano-")) nanoCallCount++
    }
    return { totalCarbonGrams, totalCostUsd, superCallCount, nanoCallCount }
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return { totalCarbonGrams: 0, totalCostUsd: 0, superCallCount: 0, nanoCallCount: 0 }
    }
    throw err
  } finally {
    db.close()
  }
}
