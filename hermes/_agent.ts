import { request } from "undici"
import {
  executeTool,
  renderToolCatalog,
  TOOLS,
  type ToolContext,
  type ToolName,
  type ToolResult,
} from "./_tools"

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface ChatLlm {
  /**
   * Sends a chat completion request and returns the assistant text.
   * Implementations: real (Joule gateway HTTP) or mock (canned).
   */
  chat(req: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
    modelHint?: "nano" | "super"
    temperature?: number
    maxTokens?: number
  }): Promise<string>
}

export interface AgentAnswer {
  answer: string
  toolUsed: ToolName | null // null when planner fell back to direct answer
  toolArgs: Record<string, string | number | undefined>
  toolResult: ToolResult | null
  rawPlannerOutput: string
}

export interface AgentConfig {
  llm: ChatLlm
  context: ToolContext
}

// ──────────────────────────────────────────────────────────────
// Planner — picks a tool (or none)
// ──────────────────────────────────────────────────────────────

const PLANNER_SYSTEM_PROMPT = `You are Hermes, an agent that answers questions about Joule's call_log database.

You have the following tools available:

${renderToolCatalog()}

Given the user's question, decide which ONE tool to call. Reply ONLY with a single JSON object on one line, no markdown, no prose:

{"tool": "<toolName>", "args": {<key>: <value>, ...}}

If no tool fits, reply:

{"tool": null, "args": {}}

Examples:
User: 이번 주 절감 얼마야?
Reply: {"tool":"getAggregateSavings","args":{}}

User: Top 5 비싼 호출 보여줘
Reply: {"tool":"getTopCalls","args":{"n":5}}

User: 모델 비율은?
Reply: {"tool":"getModelMix","args":{}}

User: 리포트 만들어줘
Reply: {"tool":"generateReport","args":{}}

User: jamie@example.com 으로 리포트 보내
Reply: {"tool":"sendWeeklyReport","args":{"to":"jamie@example.com"}}

User: 안녕
Reply: {"tool":null,"args":{}}

Only output the JSON. No explanation.`

interface PlannerDecision {
  tool: ToolName | null
  args: Record<string, string | number | undefined>
}

function isValidToolName(name: unknown): name is ToolName {
  return typeof name === "string" && TOOLS.some((t) => t.name === name)
}

export function parsePlannerOutput(raw: string): PlannerDecision {
  // The planner may include markdown fences or extra prose. Try to extract the first JSON object.
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  const candidate = fenced ? fenced[1] : (trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed)
  try {
    const parsed = JSON.parse(candidate!)
    const tool = parsed.tool
    const args = parsed.args && typeof parsed.args === "object" ? parsed.args : {}
    if (tool === null || tool === undefined) return { tool: null, args }
    if (isValidToolName(tool)) return { tool, args }
    return { tool: null, args: {} }
  } catch {
    return { tool: null, args: {} }
  }
}

// ──────────────────────────────────────────────────────────────
// Responder — converts tool result into Korean text
// ──────────────────────────────────────────────────────────────

const RESPONDER_SYSTEM_PROMPT = `당신은 Hermes — Joule 에이전트입니다. 사용자가 한국어로 질문했고, 도구 실행 결과(JSON)가 주어집니다. 결과를 한국어 1~3 문장으로 자연스럽게 요약해 답하세요.

규칙:
- 숫자는 가독성 있게 (소수점 2~3자리, 통화는 $).
- 도구 결과의 핵심 수치를 반드시 포함.
- 사용자 질문에 직접 답할 것 (메타 설명 X).
- "도구를 호출했습니다" 같은 메타 발언 금지.`

function buildResponderUserPrompt(
  userQuestion: string,
  toolName: ToolName,
  toolResult: ToolResult,
): string {
  return `사용자 질문: ${userQuestion}

도구 ${toolName} 실행 결과:
${JSON.stringify(toolResult, null, 2)}

위 결과를 바탕으로 한국어로 답해주세요.`
}

const FALLBACK_SYSTEM_PROMPT = `당신은 Hermes — Joule 에이전트입니다. 사용자의 질문에 한국어 1~2 문장으로 간단히 답하세요. Joule 의 호출 통계와 관련된 질문에는 "탄소 절감, Top 비싼 호출, 모델 비율, 주간 리포트 등을 물어보실 수 있습니다." 라고 안내해도 됩니다.`

// ──────────────────────────────────────────────────────────────
// Main agent loop
// ──────────────────────────────────────────────────────────────

export function createAgent(config: AgentConfig) {
  return {
    async ask(userQuestion: string): Promise<AgentAnswer> {
      // STEP 1 — Planner
      const plannerRaw = await config.llm.chat({
        messages: [
          { role: "system", content: PLANNER_SYSTEM_PROMPT },
          { role: "user", content: userQuestion },
        ],
        modelHint: "super",
        temperature: 0,
        maxTokens: 120,
      })
      const decision = parsePlannerOutput(plannerRaw)

      // STEP 2 — Executor (skip if no tool)
      if (decision.tool === null) {
        const fallback = await config.llm.chat({
          messages: [
            { role: "system", content: FALLBACK_SYSTEM_PROMPT },
            { role: "user", content: userQuestion },
          ],
          modelHint: "nano",
          temperature: 0.3,
          maxTokens: 200,
        })
        return {
          answer: fallback.trim(),
          toolUsed: null,
          toolArgs: {},
          toolResult: null,
          rawPlannerOutput: plannerRaw,
        }
      }

      let toolResult: ToolResult
      try {
        toolResult = await executeTool(decision.tool, decision.args, config.context)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          answer: `도구 ${decision.tool} 실행 중 오류가 발생했습니다: ${msg}`,
          toolUsed: decision.tool,
          toolArgs: decision.args,
          toolResult: null,
          rawPlannerOutput: plannerRaw,
        }
      }

      // STEP 3 — Responder
      const responderRaw = await config.llm.chat({
        messages: [
          { role: "system", content: RESPONDER_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildResponderUserPrompt(userQuestion, decision.tool, toolResult),
          },
        ],
        modelHint: "nano",
        temperature: 0.2,
        maxTokens: 300,
      })

      return {
        answer: responderRaw.trim(),
        toolUsed: decision.tool,
        toolArgs: decision.args,
        toolResult,
        rawPlannerOutput: plannerRaw,
      }
    },
  }
}

// ──────────────────────────────────────────────────────────────
// Real ChatLlm — calls Joule's own gateway (localhost:3001/v1)
// ──────────────────────────────────────────────────────────────

export interface RealLlmConfig {
  baseUrl: string // e.g. 'http://localhost:3001/v1'
  apiKey?: string // ignored by Joule, but OpenAI-compat may want it
  timeoutMs?: number
}

export function createJouleLlm(config: RealLlmConfig): ChatLlm {
  const timeoutMs = config.timeoutMs ?? 30_000
  return {
    async chat(req): Promise<string> {
      const url = `${config.baseUrl}/chat/completions`
      const body = JSON.stringify({
        model:
          req.modelHint === "super"
            ? "super-120b-a12b"
            : req.modelHint === "nano"
              ? "nano-30b-a3b"
              : "any",
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 256,
      })

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await request(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey ?? "hermes"}`,
            "User-Agent": "hermes/0.1",
          },
          body,
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (response.statusCode >= 400) {
          const text = await response.body.text()
          throw new Error(`Joule HTTP ${response.statusCode}: ${text.slice(0, 200)}`)
        }
        const json = (await response.body.json()) as {
          choices: Array<{ message: { content: string } }>
        }
        return json.choices[0]?.message?.content ?? ""
      } catch (err) {
        clearTimeout(timer)
        throw err
      }
    },
  }
}
