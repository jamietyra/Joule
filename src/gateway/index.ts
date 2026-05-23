import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import type { Measurement, TokenUsage } from "../carbon/index"
import type { CrusoeInferenceClient } from "../inference/index"
import type { RoutingDecision } from "../routing/index"
import type { CallLog, CallLogRecord } from "../storage/index"
import { composeResponse } from "./_compose"
import { ValidationError, validateChatRequest } from "./_validate"

export interface GatewayDeps {
  routing: RoutingDecision
  inference: CrusoeInferenceClient
  carbon: (input: { modelId: string } & TokenUsage, headerGrams: number | undefined) => Measurement
  storage: CallLog
}

export function createGateway(deps: GatewayDeps) {
  const app = new Hono()

  app.post("/v1/chat/completions", async (c) => {
    // 1. Validate request body
    let parsed: ReturnType<typeof validateChatRequest>
    try {
      parsed = validateChatRequest(await c.req.json())
    } catch (err) {
      if (err instanceof ValidationError) {
        return c.json({ error: err.message }, 400)
      }
      return c.json({ error: "invalid JSON body" }, 400)
    }

    // 2. Routing: decide which model to use
    const choice = await deps.routing.decide(parsed.messages)

    // 3. Inference: call Crusoe (any throw → 502)
    let inferenceResult: Awaited<ReturnType<typeof deps.inference.chat>>
    try {
      inferenceResult = await deps.inference.chat({
        modelId: choice.modelId,
        messages: parsed.messages,
        temperature: parsed.temperature,
        maxTokens: parsed.max_tokens,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: `inference failed: ${msg}` }, 502)
    }

    // 4. Carbon measurement
    const measurement = deps.carbon(
      {
        modelId: choice.modelId,
        promptTokens: inferenceResult.usage.promptTokens,
        completionTokens: inferenceResult.usage.completionTokens,
      },
      inferenceResult.carbonHeaderGrams,
    )

    // 5. Storage — failure must NOT block response
    try {
      const record: CallLogRecord = {
        id: randomUUID(),
        ts: Date.now(),
        modelId: choice.modelId,
        promptTokens: inferenceResult.usage.promptTokens,
        completionTokens: inferenceResult.usage.completionTokens,
        carbonGrams: measurement.carbonGrams,
        costUsd: measurement.costUsd,
        source: measurement.source,
        routingDecision: choice,
      }
      deps.storage.appendCallLog(record)
    } catch (err) {
      console.error("[gateway] storage append failed:", err)
    }

    // 6. Compose and return OpenAI-compatible response
    return c.json(composeResponse(choice.modelId, inferenceResult), 200)
  })

  return app
}
