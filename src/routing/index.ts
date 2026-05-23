import type { ChatMessage, CrusoeInferenceClient } from "../inference/index"
import { classifyIntent } from "./_intent-classifier"
import { modelForIntent, reasonFor } from "./_rules"

export type Intent =
  | "summarize"
  | "classify"
  | "extract"
  | "format"
  | "reasoning"
  | "code"
  | "other"

export interface ModelChoice {
  modelId: "nano-30b-a3b" | "super-120b-a12b"
  intent: Intent
  reason: string
}

export interface RoutingDecision {
  decide(messages: ChatMessage[]): Promise<ModelChoice>
}

export function createRouting(deps: { inference: CrusoeInferenceClient }): RoutingDecision {
  return {
    async decide(messages: ChatMessage[]): Promise<ModelChoice> {
      let intent: Intent
      try {
        intent = await classifyIntent(messages, deps.inference)
      } catch (err) {
        // Classifier failed (Crusoe down, timeout, etc.) → safe fallback
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          modelId: "super-120b-a12b",
          intent: "other",
          reason: `fallback: classifier failed (${errMsg})`,
        }
      }

      const modelId = modelForIntent(intent)
      const reason = reasonFor(intent, modelId)
      return { modelId, intent, reason }
    },
  }
}
