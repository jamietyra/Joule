import { resolve } from "node:path"
import { createAgent, createJouleLlm } from "@hermes/_agent"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs" // need Node APIs (undici, fs, better-sqlite3)

interface AskRequest {
  message?: unknown
}

function getDbPath(): string {
  if (process.env.JOULE_DB_PATH) return process.env.JOULE_DB_PATH
  return resolve(process.cwd(), "..", "joule.db")
}

function getJouleBaseUrl(): string {
  return process.env.JOULE_BASE_URL ?? "http://localhost:3001/v1"
}

export async function POST(request: Request) {
  let body: AskRequest
  try {
    body = (await request.json()) as AskRequest
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }

  const message = body.message
  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: 'field "message" must be a non-empty string' },
      { status: 400 },
    )
  }

  // Light safety: cap input length to prevent prompt-injection bloat
  const trimmed = message.trim().slice(0, 2000)

  try {
    const llm = createJouleLlm({ baseUrl: getJouleBaseUrl() })
    const agent = createAgent({ llm, context: { dbPath: getDbPath() } })
    const result = await agent.ask(trimmed)

    return NextResponse.json({
      answer: result.answer,
      toolUsed: result.toolUsed,
      toolArgs: result.toolArgs,
      toolResult: result.toolResult,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[api/hermes] agent error:", msg)
    return NextResponse.json({ error: "agent failed", detail: msg.slice(0, 300) }, { status: 502 })
  }
}

// GET → simple health/info (helpful during demo recording)
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/hermes",
    body: { message: "string (1~2000 chars)" },
    examples: [
      "이번 주 절감 얼마야?",
      "Top 3 비싼 호출은?",
      "Super 와 Nano 비율?",
      "주간 리포트 만들어줘",
    ],
  })
}
