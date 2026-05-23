#!/usr/bin/env tsx
import { measure } from "../src/carbon/index"
import { modelForIntent, reasonFor } from "../src/routing/_rules"
import type { Intent } from "../src/routing/index"
import { type CallLogRecord, createCallLog } from "../src/storage/index"

// --- Parse argv ---
const args = process.argv.slice(2)
let dbPath = "./joule.db"
let seed = 42
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--db" && args[i + 1]) {
    dbPath = args[i + 1]
    i++
  }
  if (args[i] === "--seed" && args[i + 1]) {
    seed = Number(args[i + 1])
    i++
  }
}

const PERSONAS = ["dev-junior", "pm", "data-scientist", "copywriter", "student"]

const INTENT_MIX: Array<{ intent: Intent; weight: number }> = [
  { intent: "summarize", weight: 70 },
  { intent: "code", weight: 20 },
  { intent: "classify", weight: 5 },
  { intent: "other", weight: 5 },
]
const TOTAL_WEIGHT = INTENT_MIX.reduce((s, m) => s + m.weight, 0) // 100

// --- LCG seeded RNG ---
function makeRng(s: number) {
  let state = s >>> 0
  return (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000 // [0, 1)
  }
}

function pickIntent(rng: () => number): Intent {
  const r = rng() * TOTAL_WEIGHT
  let cum = 0
  for (const m of INTENT_MIX) {
    cum += m.weight
    if (r < cum) return m.intent
  }
  return "other"
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

// --- Main generation ---
const rng = makeRng(seed)
const storage = createCallLog(dbPath)

const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.now()
let totalRecords = 0

for (const persona of PERSONAS) {
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const dayStart = now - (dayOffset + 1) * DAY_MS // start of day N days ago
    const callsThisDay = randInt(rng, 30, 50)

    for (let i = 0; i < callsThisDay; i++) {
      const intent = pickIntent(rng)
      const modelId = modelForIntent(intent)
      const promptTokens = randInt(rng, 100, 500)
      const completionTokens = randInt(rng, 50, 300)
      const m = measure(
        { modelId, promptTokens, completionTokens },
        undefined, // no header in synthetic data — always 'static'
      )
      const ts = dayStart + Math.floor(rng() * DAY_MS)
      const record: CallLogRecord = {
        id: `seed-${seed}-${persona}-${dayOffset}-${i}`,
        ts,
        modelId,
        promptTokens,
        completionTokens,
        carbonGrams: m.carbonGrams,
        costUsd: m.costUsd,
        source: m.source,
        routingDecision: { modelId, intent, reason: reasonFor(intent, modelId) },
        personaTag: persona,
      }
      storage.appendCallLog(record)
      totalRecords++
    }
  }
}

console.log(
  `Seeded ${totalRecords} records into ${dbPath} (seed=${seed}, personas=${PERSONAS.length}, days=30)`,
)
