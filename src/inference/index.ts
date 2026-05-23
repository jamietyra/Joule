export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  modelId: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface InferenceResult {
  modelId: string;
  content: string; // assistant reply
  usage: TokenUsage;
  carbonHeaderGrams: number | undefined; // X-Carbon-grams header value (undefined if Crusoe doesn't send it)
}

export interface CrusoeInferenceClient {
  chat(req: ChatRequest): Promise<InferenceResult>;
}

// T08 will fill this in to return _real-adapter. For T07, leave as stub that throws.
export function createFromEnv(): CrusoeInferenceClient {
  throw new Error('Not implemented in T07 — T08 (Real adapter) will implement createFromEnv');
}

export interface MockScenario {
  // Matches when the LAST user message content contains `userMessageContains`.
  userMessageContains: string;
  // Response content the mock returns.
  responseContent: string;
  // Token usage to report.
  usage: TokenUsage;
  // Optional X-Carbon-grams header value (undefined = Crusoe didn't send it).
  carbonHeaderGrams?: number | undefined;
}

export { createMock } from './_mock-adapter.js';
