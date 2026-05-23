import type { Intent, ModelChoice } from './index';

export interface Rule {
  intent: Intent;
  modelId: ModelChoice['modelId'];
}

// Single source of truth for intent→model mapping.
// v0.1 ships ONE real routing decision: summarize → nano. Other intents map to super
// as a "spec table" only (not exercised in demo cuts).
export const RULES: Rule[] = [
  { intent: 'summarize', modelId: 'nano-30b-a3b' },
  { intent: 'classify', modelId: 'super-120b-a12b' },
  { intent: 'extract', modelId: 'super-120b-a12b' },
  { intent: 'format', modelId: 'super-120b-a12b' },
  { intent: 'reasoning', modelId: 'super-120b-a12b' },
  { intent: 'code', modelId: 'super-120b-a12b' },
  { intent: 'other', modelId: 'super-120b-a12b' },
];

export const DEFAULT_MODEL_ID: ModelChoice['modelId'] = 'super-120b-a12b';

export function modelForIntent(intent: Intent): ModelChoice['modelId'] {
  const rule = RULES.find((r) => r.intent === intent);
  return rule?.modelId ?? DEFAULT_MODEL_ID;
}

export function reasonFor(intent: Intent, modelId: ModelChoice['modelId']): string {
  if (intent === 'summarize' && modelId === 'nano-30b-a3b') {
    return 'rule #1: summarize → nano';
  }
  return `default rule: ${intent} → ${modelId}`;
}
