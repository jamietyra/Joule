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
User: How much did we save this week?
Reply: {"tool":"getAggregateSavings","args":{}}

User: Show top 5 most expensive calls
Reply: {"tool":"getTopCalls","args":{"n":5}}

User: What's the Super vs Nano ratio?
Reply: {"tool":"getModelMix","args":{}}

User: Generate the weekly report
Reply: {"tool":"generateReport","args":{}}

User: Send the report to jamie@example.com
Reply: {"tool":"sendWeeklyReport","args":{"to":"jamie@example.com"}}

User: Hi
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

const RESPONDER_SYSTEM_PROMPT = `You are Hermes — the Joule agent. The user asked a question in English and a tool was executed (its result is provided as JSON). Summarize the result in 1–3 natural English sentences as the final answer to the user.

Rules:
- Format numbers cleanly (2–3 decimals; currency with $).
- Always include the key numbers from the tool result.
- Answer the user directly. No meta phrases like "I called the tool".`

function buildResponderUserPrompt(
  userQuestion: string,
  toolName: ToolName,
  toolResult: ToolResult,
): string {
  return `User question: ${userQuestion}

Tool ${toolName} execution result:
${JSON.stringify(toolResult, null, 2)}

Use the result above to answer the user in English.`
}

const FALLBACK_SYSTEM_PROMPT = `You are Hermes — the Joule agent. Answer the user briefly (1–2 sentences) in English. If they ask about Joule data, suggest: "You can ask about carbon savings, top expensive calls, model mix, or the weekly report."`

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
          answer: `Tool ${decision.tool} failed: ${msg}`,
          toolUsed: decision.tool,
          toolArgs: decision.args,
          toolResult: null,
          rawPlannerOutput: plannerRaw,
        }
      }

      // STEP 3 — Responder
      // Nano produced empty content on larger tool JSON (getTopCalls / getModelMix)
      // during demo testing. Super is more reliable for natural-language summaries.
      const responderRaw = await config.llm.chat({
        messages: [
          { role: "system", content: RESPONDER_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildResponderUserPrompt(userQuestion, decision.tool, toolResult),
          },
        ],
        modelHint: "super",
        temperature: 0.2,
        maxTokens: 500,
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
