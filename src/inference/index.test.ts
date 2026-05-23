import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import { createMock, type MockScenario } from './index.js';
import { createRealAdapter, AuthError, TimeoutError } from './_real-adapter.js';

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

describe('Inference Real adapter (undici mock)', () => {
  let mockAgent: MockAgent;
  let originalDispatcher: Dispatcher;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
  });

  it('200 response → token usage parsed', async () => {
    const pool = mockAgent.get('https://api.fake.crusoecloud.com');
    pool.intercept({
      path: '/v1/chat/completions',
      method: 'POST',
    }).reply(200, {
      id: 'chatcmpl-test1',
      choices: [{ message: { role: 'assistant', content: 'hi back' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
    });

    const client = createRealAdapter({ apiKey: 'sk-fake', baseUrl: 'https://api.fake.crusoecloud.com/v1' });
    const result = await client.chat({
      modelId: 'nano-30b-a3b',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.content).toBe('hi back');
    expect(result.usage.promptTokens).toBe(42);
    expect(result.usage.completionTokens).toBe(7);
    expect(result.usage.totalTokens).toBe(49);
    expect(result.carbonHeaderGrams).toBeUndefined();
  });

  it('X-Carbon-grams header extracted', async () => {
    const pool = mockAgent.get('https://api.fake.crusoecloud.com');
    pool.intercept({
      path: '/v1/chat/completions',
      method: 'POST',
    }).reply(200, {
      id: 'chatcmpl-test2',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }, {
      headers: { 'X-Carbon-grams': '3.14' },
    });

    const client = createRealAdapter({ apiKey: 'sk-fake', baseUrl: 'https://api.fake.crusoecloud.com/v1' });
    const result = await client.chat({
      modelId: 'nano-30b-a3b',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.carbonHeaderGrams).toBe(3.14);
  });

  it('401 → AuthError', async () => {
    const pool = mockAgent.get('https://api.fake.crusoecloud.com');
    pool.intercept({
      path: '/v1/chat/completions',
      method: 'POST',
    }).reply(401, { error: 'unauthorized' });

    const client = createRealAdapter({ apiKey: 'sk-bad', baseUrl: 'https://api.fake.crusoecloud.com/v1' });
    await expect(client.chat({
      modelId: 'nano-30b-a3b',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow(AuthError);
  });

  it('timeout → TimeoutError', async () => {
    const pool = mockAgent.get('https://api.fake.crusoecloud.com');
    pool.intercept({
      path: '/v1/chat/completions',
      method: 'POST',
    }).reply(200, {
      id: 'should-timeout',
      choices: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }).delay(300); // 300ms delay > 50ms timeout

    const client = createRealAdapter({
      apiKey: 'sk-fake',
      baseUrl: 'https://api.fake.crusoecloud.com/v1',
      timeoutMs: 50,
    });

    await expect(client.chat({
      modelId: 'nano-30b-a3b',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow(TimeoutError);
  });
});
