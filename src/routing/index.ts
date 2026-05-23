import type { ChatMessage, CrusoeInferenceClient } from '../inference/index';

/**
 * Intent classification labels for routing decisions.
 * Spec v0.1: summarize gets nano, all others (and unrecognized) fall back to super.
 */
export type Intent = 'summarize' | 'classify' | 'extract' | 'format' | 'reasoning' | 'code' | 'other';

/**
 * Model choice decision: which Crusoe model to use + why.
 */
export interface ModelChoice {
  modelId: 'nano-30b-a3b' | 'super-120b-a12b';
  intent: Intent;
  reason: string;
}

/**
 * Routing decision interface.
 * Takes a conversation and returns the model choice.
 */
export interface RoutingDecision {
  decide(messages: ChatMessage[]): Promise<ModelChoice>;
}

/**
 * Routing module factory.
 * Accepts an inference client and returns a RoutingDecision.
 */
export function createRouting(deps: { inference: CrusoeInferenceClient }): RoutingDecision {
  throw new Error('Not implemented in T10 — TDD red phase');
}
