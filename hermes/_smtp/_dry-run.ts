import { writeFileSync } from "node:fs"
import type { SmtpClient, SmtpSendInput } from "./index"

export interface DryRunConfig {
  outputPath: string
}

export function createDryRun(config: DryRunConfig): SmtpClient {
  return {
    async send(input: SmtpSendInput): Promise<void> {
      console.log(
        JSON.stringify({
          mode: "dry-run",
          to: input.to,
          subject: input.subject,
          outputPath: config.outputPath,
          htmlBytes: input.html.length,
        }),
      )
      writeFileSync(config.outputPath, input.html, "utf-8")
    },
  }
}
