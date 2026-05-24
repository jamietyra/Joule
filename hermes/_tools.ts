import { writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { type CallLogRecord, createCallLog } from "../src/storage/index"
import { composeWeeklyReportHtml } from "./_compose"
import { queryReportData } from "./_query"
import { createDryRun, createFromEnv } from "./_smtp/index"

// Weekly-report HTML lives next to the SQLite DB so the path is the same
// regardless of cwd (CLI from repo root, or dashboard route from dashboard/).
function defaultReportPath(dbPath: string): string {
  const abs = isAbsolute(dbPath) ? dbPath : resolve(process.cwd(), dbPath)
  return resolve(dirname(abs), "weekly-report-preview.html")
}

export type ToolName =
  | "getAggregateSavings"
  | "getTopCalls"
  | "getModelMix"
  | "generateReport"
  | "sendWeeklyReport"

export interface ToolParameter {
  type: "string" | "number"
  description: string
  default?: string | number
}

export interface ToolDefinition {
  name: ToolName
  description: string
  parameters: Record<string, ToolParameter>
  effect: "read-only" | "file-write" | "external"
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "getAggregateSavings",
    description:
      "Returns total CO₂ (g), cost ($), Super/Nano call counts, and total call count across all logged calls.",
    parameters: {},
    effect: "read-only",
  },
  {
    name: "getTopCalls",
    description: "Returns the top N most expensive calls (by cost in USD).",
    parameters: {
      n: { type: "number", description: "Number of calls to return (1–10).", default: 3 },
    },
    effect: "read-only",
  },
  {
    name: "getModelMix",
    description: "Returns the ratio and counts of Super vs Nano calls.",
    parameters: {},
    effect: "read-only",
  },
  {
    name: "generateReport",
    description:
      "Generates the weekly report HTML and writes it to a file (no email send). Preview-only.",
    parameters: {
      output: {
        type: "string",
        description: "Output file path.",
        default: "/tmp/weekly-report-preview.html",
      },
    },
    effect: "file-write",
  },
  {
    name: "sendWeeklyReport",
    description:
      "Sends the weekly report via Gmail SMTP. When HERMES_FORCE_DRY_RUN=true is set, writes to a file only.",
    parameters: {
      to: {
        type: "string",
        description: "Recipient email address.",
        default: "env:HERMES_DEFAULT_TO",
      },
    },
    effect: "external",
  },
]

export interface ToolContext {
  dbPath: string
}

// Result shapes returned to the Responder LLM. Plain JSON-friendly.
export type ToolResult =
  | {
      kind: "aggregateSavings"
      totalCarbonGrams: number
      totalCostUsd: number
      superCallCount: number
      nanoCallCount: number
      totalCalls: number
    }
  | {
      kind: "topCalls"
      n: number
      calls: Array<
        Pick<CallLogRecord, "id" | "ts" | "modelId" | "carbonGrams" | "costUsd"> & {
          intent: string
        }
      >
    }
  | {
      kind: "modelMix"
      superCount: number
      nanoCount: number
      superRatio: number
      nanoRatio: number
      totalCalls: number
    }
  | { kind: "generateReport"; output: string; htmlBytes: number; topCallCount: number }
  | {
      kind: "sendWeeklyReport"
      mode: "real" | "dry-run"
      to: string
      htmlBytes: number
      output?: string
    }

export async function executeTool(
  name: ToolName,
  args: Record<string, string | number | undefined>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "getAggregateSavings": {
      const storage = createCallLog(ctx.dbPath)
      const agg = storage.aggregateSavings()
      const all = storage.readCallLog()
      return {
        kind: "aggregateSavings",
        totalCarbonGrams: agg.totalCarbonGrams,
        totalCostUsd: agg.totalCostUsd,
        superCallCount: agg.superCallCount,
        nanoCallCount: agg.nanoCallCount,
        totalCalls: all.length,
      }
    }

    case "getTopCalls": {
      const rawN = typeof args.n === "number" ? args.n : Number(args.n ?? 3)
      const n = Math.min(Math.max(1, Math.floor(rawN || 3)), 10)
      const storage = createCallLog(ctx.dbPath)
      const all = storage.readCallLog()
      const top = [...all].sort((a, b) => b.costUsd - a.costUsd).slice(0, n)
      return {
        kind: "topCalls",
        n,
        calls: top.map((r) => ({
          id: r.id,
          ts: r.ts,
          modelId: r.modelId,
          carbonGrams: r.carbonGrams,
          costUsd: r.costUsd,
          intent: r.routingDecision?.intent ?? "other",
        })),
      }
    }

    case "getModelMix": {
      const storage = createCallLog(ctx.dbPath)
      const agg = storage.aggregateSavings()
      const all = storage.readCallLog()
      const total = all.length
      const superRatio = total > 0 ? agg.superCallCount / total : 0
      const nanoRatio = total > 0 ? agg.nanoCallCount / total : 0
      return {
        kind: "modelMix",
        superCount: agg.superCallCount,
        nanoCount: agg.nanoCallCount,
        superRatio,
        nanoRatio,
        totalCalls: total,
      }
    }

    case "generateReport": {
      const output = (args.output as string | undefined) ?? defaultReportPath(ctx.dbPath)
      const data = queryReportData(ctx.dbPath)
      const html = composeWeeklyReportHtml(data)
      writeFileSync(output, html, "utf-8")
      return {
        kind: "generateReport",
        output,
        htmlBytes: html.length,
        topCallCount: data.top3.length,
      }
    }

    case "sendWeeklyReport": {
      let toRaw = args.to as string | undefined
      if (!toRaw || toRaw === "env:HERMES_DEFAULT_TO") {
        toRaw = process.env.HERMES_DEFAULT_TO ?? "demo@example.com"
      }
      const data = queryReportData(ctx.dbPath)
      const html = composeWeeklyReportHtml(data)

      const forceDryRun = process.env.HERMES_FORCE_DRY_RUN === "true"
      if (forceDryRun) {
        const output = defaultReportPath(ctx.dbPath)
        const dry = createDryRun({ outputPath: output })
        await dry.send({ to: toRaw, subject: "Joule — Weekly Report", html })
        return {
          kind: "sendWeeklyReport",
          mode: "dry-run",
          to: toRaw,
          htmlBytes: html.length,
          output,
        }
      }

      const smtp = createFromEnv()
      await smtp.send({ to: toRaw, subject: "Joule — Weekly Report", html })
      return {
        kind: "sendWeeklyReport",
        mode: "real",
        to: toRaw,
        htmlBytes: html.length,
      }
    }
  }
}

// Helper for the planner LLM — render the tool catalog as a system-prompt friendly string.
export function renderToolCatalog(): string {
  return TOOLS.map((t) => {
    const params = Object.entries(t.parameters)
      .map(
        ([k, p]) =>
          `${k}: ${p.type}${p.default !== undefined ? ` (default: ${JSON.stringify(p.default)})` : ""} — ${p.description}`,
      )
      .join(", ")
    return `- ${t.name}(${params || "none"}) [${t.effect}] — ${t.description}`
  }).join("\n")
}
