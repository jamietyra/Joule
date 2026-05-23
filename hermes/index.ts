#!/usr/bin/env tsx
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
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    subcommand: null,
    reportType: null,
    dryRun: false,
    db: "./joule.db",
    to: "",
    output: "",
  }
  let i = 0
  if (argv[i] && !argv[i]?.startsWith("--")) {
    args.subcommand = argv[i] ?? null
    i++
  }
  if (argv[i] && !argv[i]?.startsWith("--")) {
    args.reportType = argv[i] ?? null
    i++
  }
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
    }
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
  } else {
    console.error(
      "Usage: hermes run weekly-report [--dry-run] [--db <path>] [--to <email>] [--output <path>]",
    )
    process.exit(1)
  }
}
