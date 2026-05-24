# Joule

> **Charge AI for its own electricity bill.**

Joule is a **Carbon-aware AI Gateway** — an OpenAI-compatible proxy that tracks carbon, cost, and power of every LLM call in real time, auto-routes each request to the smallest sufficient model (Nemotron 3 Nano vs. Super), and produces a weekly savings report.

**DevNetwork [AI+ML] Hackathon 2026 — Crusoe Challenge submission.**

## One-line entry — the base_url diff

Change just one line in your existing OpenAI client:

```python
# Before
client = OpenAI(api_key="sk-...", base_url="https://api.openai.com/v1")

# After (route through Joule)
client = OpenAI(api_key="any", base_url="http://localhost:3001/v1")
```

Every request then:
1. Joule classifies the intent (Nano ~10ms)
2. Auto-routes to Nemotron Nano (summarize) or Super (reasoning / code)
3. Calls Crusoe Managed Inference
4. Extracts `X-Carbon-grams` header + static lookup-table fallback (Defensive)
5. Writes to SQLite call log
6. Returns an OpenAI-compatible response

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure .env
cp .env.example .env
# Fill in CRUSOE_API_KEY in .env

# 3. Boot Joule core (localhost:3001)
npm run dev

# 4. Boot Dashboard (localhost:3000, separate terminal)
cd dashboard && npm install && npm run dev

# 5. Hermes agent — ask in natural language (Joule must be running)
npx tsx hermes/index.ts ask "How much did we save this week?"

# 5b. Hermes weekly report — dry-run preview (optional)
npx tsx hermes/index.ts run weekly-report --dry-run \
  --db ./joule.db --to demo@example.com \
  --output ./weekly-report-preview.html

# 6. Persona seed (data for the dashboard charts)
npx tsx scripts/generate_personas.ts --seed 42
```

## Hermes Agent (natural language)

Hermes is a read-only natural-language agent that queries the Joule call log. It **calls Crusoe Nemotron through Joule's own OpenAI-compatible endpoint (`localhost:3001/v1`)**, so Hermes's own LLM calls are also carbon-measured — self-reference.

### CLI

```bash
npx tsx hermes/index.ts ask "How much did we save this week?"
npx tsx hermes/index.ts ask "What are the top 3 most expensive calls?"
npx tsx hermes/index.ts ask "What's the Super vs Nano ratio?"
```

### Dashboard chat

Type natural-language questions in the chat panel below the stats on `http://localhost:3000`. Four example chips are available for instant one-click queries.

### Tools (5, all demo-able)

| Tool | Example query | Effect |
|---|---|---|
| `getAggregateSavings` | "How much did we save this week?" | read-only |
| `getTopCalls(n)` | "What are the top 3 most expensive calls?" | read-only |
| `getModelMix` | "What's the Super vs Nano ratio?" | read-only |
| `generateReport` | "Generate a report" | file-write |
| `sendWeeklyReport(to)` | "Send the report to jamie@example.com" | external (SMTP) |

### Safety guards

- Input length cap (2000 chars) — prevents prompt injection
- `getTopCalls(n)` clamps `n` to 1–10
- `HERMES_FORCE_DRY_RUN=true` env forces `sendWeeklyReport` to file output only (recommended for demos)
- Tool names are whitelist-validated (blocks arbitrary execution)
- LLM response JSON parse failure → safe natural-language fallback answer

### Architecture (Hermes step by step)

```
User input ("Show me the top 3 most expensive calls")
   ↓
Planner (Super) → JSON tool decision
   {"tool":"getTopCalls","args":{"n":3}}
   ↓
Executor → tool call (SQLite read)
   [{id, modelId, cost, ...}, ...]
   ↓
Responder (Nano) → 1–3 English sentences
   "The three most expensive calls were..."
```

All three steps route through Joule's own endpoint — Hermes measures its own carbon too.

## Architecture

Local-first. All processes run on the same machine:

- **Joule core** — Hono on Node 20, localhost:3001 (Gateway + Routing + Inference + Carbon + Storage, 5 modules)
- **Dashboard** — Next.js 14 app router, localhost:3000 (recharts + SQLite read)
- **Hermes** — CLI binary (manual trigger v0.1; autonomous cron post-hackathon)
- **Shared state** — `./joule.db` (better-sqlite3 WAL)

No external hosting (no Vercel / Railway). Static landing only on GitHub Pages.

## 6-shot demo verification

Each script works when Joule core (:3001) or Dashboard (:3000) is running.

- `scripts/verify-shot-1.sh` — BaseURLDiff (chatcmpl- id response)
- `scripts/verify-shot-2.sh` — AutoModelSelection (summarize→nano, code→super)
- `scripts/verify-shot-3.sh` — Dashboard cumulative (live data point)
- `scripts/verify-shot-4.sh` — Hermes weekly report dry-run (HTML preview)
- `scripts/verify-shot-5.sh` — XCarbonGrams source label (static/header)
- `scripts/verify-shot-6.sh` — **Hermes natural-language chat (natural language → tool → answer)**

## Demo video

(Replace placeholder after recording)

- YouTube: `<TODO>`
- Length: ~2:30
- 5 live cuts + camera cut

## Development

- Test: `npm test` — 48 tests across 9 files
- Typecheck: `npm run typecheck`
- Pre-commit: `pre-commit install` (auto-formatter + detect-secrets + tsc)

## License

MIT — see [LICENSE](./LICENSE).
