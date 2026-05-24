#!/usr/bin/env tsx
import { createAgent, createJouleLlm } from "./_agent"
import { composeWeeklyReportHtml } from "./_compose"
import { queryReportData } from "./_query"
import { createDryRun, createFromEnv } from "./_smtp/index"

interface CliArgs {
  subcommand: string | null
  reportType: string | null
  dryRun: boolean
  db: string
  to: string
  output: string
  baseUrl: string | null
  question: string | null
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    subcommand: null,
    reportType: null,
    dryRun: false,
    db: "./joule.db",
    to: "",
    output: "",
    baseUrl: null,
    question: null,
  }
  let i = 0
  if (argv[i] && !argv[i]?.startsWith("--")) {
    args.subcommand = argv[i] ?? null
    i++
  }
  // For 'ask', the second positional may be the question or a flag.
  // For 'run', it's the report type.
  if (args.subcommand !== "ask" && argv[i] && !argv[i]?.startsWith("--")) {
    args.reportType = argv[i] ?? null
    i++
  }
  // Collect remaining positionals (non-flag tokens) for the question
  const positionals: string[] = []
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dry-run") args.dryRun = true
    else if (a === "--db" && argv[i + 1]) {
      args.db = argv[i + 1] ?? "./joule.db"
      i++
    } else if (a === "--to" && argv[i + 1]) {
      args.to = argv[i + 1] ?? ""
      i++
    } else if (a === "--output" && argv[i + 1]) {
      args.output = argv[i + 1] ?? ""
      i++
    } else if (a === "--base-url" && argv[i + 1]) {
      args.baseUrl = argv[i + 1] ?? null
      i++
    } else if (!a?.startsWith("--")) {
      positionals.push(a)
    }
  }
  // For 'ask', the last (or only) positional is the question
  if (args.subcommand === "ask" && positionals.length > 0) {
    args.question = positionals[positionals.length - 1] ?? null
  }
  return args
}

export async function runWeeklyReport(args: CliArgs): Promise<void> {
  const data = queryReportData(args.db)
  const html = composeWeeklyReportHtml(data)

  const smtp = args.dryRun
    ? createDryRun({ outputPath: args.output || "/tmp/weekly-report-preview.html" })
    : createFromEnv()

  await smtp.send({
    to: args.to || "demo@example.com",
    subject: "Joule — Weekly Report",
    html,
  })
}

export async function runAsk(
  question: string,
  opts: { db: string; baseUrl: string },
): Promise<{ answer: string; toolUsed: string | null }> {
  const llm = createJouleLlm({ baseUrl: opts.baseUrl })
  const agent = createAgent({ llm, context: { dbPath: opts.db } })
  const result = await agent.ask(question)
  return { answer: result.answer, toolUsed: result.toolUsed }
}

// Only run as CLI when invoked directly (not when imported by tests)
const isMain =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  process.argv[1]?.endsWith("hermes/index.ts") ||
  process.argv[1]?.endsWith("hermes\\index.ts")
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  if (args.subcommand === "run" && args.reportType === "weekly-report") {
    runWeeklyReport(args).catch((err) => {
      console.error("hermes error:", err)
      process.exit(1)
    })
  } else if (args.subcommand === "ask") {
    if (!args.question) {
      console.error('Usage: hermes ask [--db <path>] [--base-url <url>] "<question>"')
      process.exit(1)
    }
    runAsk(args.question, {
      db: args.db,
      baseUrl: args.baseUrl ?? "http://localhost:3001/v1",
    })
      .then((r) => {
        console.log(r.answer)
      })
      .catch((err) => {
        console.error("hermes ask error:", err)
        process.exit(1)
      })
  } else {
    console.error(
      "Usage:\n" +
        "  hermes run weekly-report [--dry-run] [--db <path>] [--to <email>] [--output <path>]\n" +
        '  hermes ask [--db <path>] [--base-url <url>] "<question>"',
    )
    process.exit(1)
  }
}
