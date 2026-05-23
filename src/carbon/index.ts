import { STATIC_TABLE, DEFAULT_MODEL_ID } from './_static-table';
import { parseCarbonHeader } from './_parse-header';

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
  // 1. Find model row in static table; fallback to DEFAULT (Super) + warn if unknown
  let row = STATIC_TABLE[input.modelId];
  if (row === undefined) {
    console.warn(`[carbon] unknown modelId "${input.modelId}", falling back to default (${DEFAULT_MODEL_ID})`);
    row = STATIC_TABLE[DEFAULT_MODEL_ID]!;
  }

  // 2. Calculate static carbon & cost (always use static for cost)
  const totalTokens = input.promptTokens + input.completionTokens;
  const staticCarbon = (row.grams_per_1k * totalTokens) / 1000;
  const costUsd = (row.usd_per_1k * totalTokens) / 1000;

  // 3. Apply header if valid; else fallback to static carbon
  const headerCarbon = parseCarbonHeader(carbonHeaderGrams);
  if (headerCarbon !== undefined) {
    return { carbonGrams: headerCarbon, costUsd, source: 'header' };
  }
  return { carbonGrams: staticCarbon, costUsd, source: 'static' };
}
