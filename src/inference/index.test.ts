import { describe, it, expect } from 'vitest';
import { createMock, type MockScenario } from './index.js';

describe('Inference Mock', () => {
  it('matches scenario by user message substring and returns response', async () => {
    const scenarios: MockScenario[] = [
      {
        userMessageContains: 'summarize',
        responseContent: 'Here is a summary.',
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
      },
    ];
    const client = createMock(scenarios);
    const result = await client.chat({
      modelId: 'nano-30b-a3b',
      messages: [{ role: 'user', content: 'Please summarize this text.' }],
    });
    expect(result.modelId).toBe('nano-30b-a3b');
    expect(result.content).toBe('Here is a summary.');
    expect(result.usage.totalTokens).toBe(60);
  });

  it('scenario without carbonHeaderGrams returns undefined', async () => {
    const scenarios: MockScenario[] = [
      {
        userMessageContains: 'no-header',
        responseContent: 'ok',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        // carbonHeaderGrams omitted
      },
    ];
    const client = createMock(scenarios);
    const result = await client.chat({
      modelId: 'nano-30b-a3b',
      messages: [{ role: 'user', content: 'no-header please' }],
    });
    expect(result.carbonHeaderGrams).toBeUndefined();
  });

  it('scenario with carbonHeaderGrams=2.5 returns 2.5', async () => {
    const scenarios: MockScenario[] = [
      {
        userMessageContains: 'with-header',
        responseContent: 'ok',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        carbonHeaderGrams: 2.5,
      },
    ];
    const client = createMock(scenarios);
    const result = await client.chat({
      modelId: 'nano-30b-a3b',
      messages: [{ role: 'user', content: 'with-header please' }],
    });
    expect(result.carbonHeaderGrams).toBe(2.5);
  });
});
