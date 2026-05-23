export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface Measurement {
  carbonGrams: number;
  costUsd: number;
  source: 'static' | 'header';
}

export function measure(
  input: { modelId: string } & TokenUsage,
  carbonHeaderGrams: number | undefined
): Measurement {
  throw new Error('Not implemented in T05 — T06 will implement');
}
