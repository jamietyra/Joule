import { describe, it, expect } from 'vitest';
import { createRouting } from './index';
import type { CrusoeInferenceClient, ChatMessage } from '../inference/index';

/**
 * Helper: Create a mock inference that always returns a specific intent string.
 * The classifier expects the inference to return a single lowercase word in result.content.
 */
function mockInferenceReturning(intent: string): CrusoeInferenceClient {
  return {
    async chat() {
      return {
        modelId: 'nano-30b-a3b',
        content: intent,
        usage: { promptTokens: 50, completionTokens: 1, totalTokens: 51 },
        carbonHeaderGrams: undefined,
      };
    },
  };
}

/**
 * Helper: Create a mock inference that throws an error.
 * Used to test fallback behavior when the classifier fails.
 */
function mockInferenceThrowing(): CrusoeInferenceClient {
  return {
    async chat() {
      throw new Error('IntentClassifier inference failed: Crusoe service unavailable');
    },
  };
}

describe('Routing decision layer', () => {
  it('Test 1: summarize prompt → nano (rule #1)', async () => {
    const routing = createRouting({ inference: mockInferenceReturning('summarize') });
    const result = await routing.decide([{ role: 'user', content: 'Please summarize the article' }]);

    expect(result.modelId).toBe('nano-30b-a3b');
    expect(result.intent).toBe('summarize');
    expect(result.reason).toBeTruthy();
    expect(result.reason).toContain('summarize');
  });

  it('Test 2: code prompt → super', async () => {
    const routing = createRouting({ inference: mockInferenceReturning('code') });
    const result = await routing.decide([{ role: 'user', content: 'Write a Python function' }]);

    expect(result.modelId).toBe('super-120b-a12b');
    expect(result.intent).toBe('code');
    expect(result.reason).toBeTruthy();
  });

  it('Test 3: IntentClassifier fail (throw) → fallback other + super', async () => {
    const routing = createRouting({ inference: mockInferenceThrowing() });
    const result = await routing.decide([{ role: 'user', content: 'Anything' }]);

    // Must NOT propagate the error. Falls back to 'other' intent and super model.
    expect(result.modelId).toBe('super-120b-a12b');
    expect(result.intent).toBe('other');
    expect(result.reason).toBeTruthy();
    expect(result.reason.toLowerCase()).toMatch(/fallback|classifier.*fail/);
  });

  it('Test 4: reason field is a non-empty string and round-trips via JSON', async () => {
    const routing = createRouting({ inference: mockInferenceReturning('summarize') });
    const result = await routing.decide([{ role: 'user', content: 'Summarize this' }]);

    // Verify reason is a non-empty string
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);

    // Verify JSON round-trip
    const serialized = JSON.stringify(result);
    const deserialized = JSON.parse(serialized);

    expect(deserialized.modelId).toBe(result.modelId);
    expect(deserialized.intent).toBe(result.intent);
    expect(deserialized.reason).toBe(result.reason);
  });

  it('Test 5: rules table — all 6 intent variants resolve to valid modelId', async () => {
    const intents = ['summarize', 'classify', 'extract', 'format', 'reasoning', 'code', 'other'];

    for (const intent of intents) {
      const routing = createRouting({ inference: mockInferenceReturning(intent) });
      const result = await routing.decide([{ role: 'user', content: `Test ${intent}` }]);

      // Must resolve to either nano or super
      expect(['nano-30b-a3b', 'super-120b-a12b']).toContain(result.modelId);

      // For summarize specifically, must be nano
      if (intent === 'summarize') {
        expect(result.modelId).toBe('nano-30b-a3b');
      }

      // For all others (classify, extract, format, reasoning, code, other), must be super
      if (intent !== 'summarize') {
        expect(result.modelId).toBe('super-120b-a12b');
      }

      expect(result.intent).toBe(intent);
      expect(result.reason).toBeTruthy();
    }
  });
});
