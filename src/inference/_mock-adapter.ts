import type {
  CrusoeInferenceClient,
  ChatRequest,
  InferenceResult,
  MockScenario,
} from './index.js';

export function createMock(scenarios: MockScenario[]): CrusoeInferenceClient {
  return {
    async chat(req: ChatRequest): Promise<InferenceResult> {
      const lastUserMessage = req.messages
        .filter((m) => m.role === 'user')
        .pop();

      if (lastUserMessage === undefined) {
        throw new Error('Mock: no user message found in request');
      }

      const matched = scenarios.find((s) =>
        lastUserMessage.content.includes(s.userMessageContains),
      );

      if (matched === undefined) {
        throw new Error(
          `Mock: no scenario matched message content "${lastUserMessage.content}"`,
        );
      }

      return {
        modelId: req.modelId,
        content: matched.responseContent,
        usage: matched.usage,
        carbonHeaderGrams: matched.carbonHeaderGrams ?? undefined,
      };
    },
  };
}
