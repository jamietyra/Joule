import { request } from 'undici';
import type {
  CrusoeInferenceClient,
  ChatRequest,
  InferenceResult,
} from './index';

export interface RealAdapterConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number; // default 30000
}

export function createRealAdapter(config: RealAdapterConfig): CrusoeInferenceClient {
  const timeoutMs = config.timeoutMs ?? 30_000;

  return {
    async chat(req: ChatRequest): Promise<InferenceResult> {
      const url = `${config.baseUrl}/chat/completions`;
      const body = JSON.stringify({
        model: req.modelId,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
            'User-Agent': 'joule/0.1',
          },
          body,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new TimeoutError(`Crusoe request timed out after ${timeoutMs}ms`);
        }
        throw new NetworkError(`Crusoe network error: ${err instanceof Error ? err.message : String(err)}`);
      }
      clearTimeout(timer);

      const status = response.statusCode;
      // Error status handling
      if (status === 401 || status === 403) {
        throw new AuthError(`Crusoe auth failed (HTTP ${status})`);
      }
      if (status === 429) {
        throw new RateLimitError(`Crusoe rate limit (HTTP 429)`);
      }
      if (status >= 500) {
        const text = await response.body.text();
        throw new ServerError(`Crusoe server error (HTTP ${status}): ${text.slice(0, 200)}`);
      }
      if (status >= 400) {
        const text = await response.body.text();
        throw new ServerError(`Crusoe client error (HTTP ${status}): ${text.slice(0, 200)}`);
      }

      const json = (await response.body.json()) as {
        id: string;
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      // Extract X-Carbon-grams header (undici lowercases header keys)
      const carbonHeader = response.headers['x-carbon-grams'];
      const carbonHeaderRaw = Array.isArray(carbonHeader) ? carbonHeader[0] : carbonHeader;
      let carbonHeaderGrams: number | undefined;
      if (typeof carbonHeaderRaw === 'string') {
        const parsed = Number(carbonHeaderRaw);
        if (Number.isFinite(parsed) && parsed >= 0) {
          carbonHeaderGrams = parsed;
        }
      }

      return {
        modelId: req.modelId,
        content: json.choices[0]?.message?.content ?? '',
        usage: {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        },
        carbonHeaderGrams,
      };
    },
  };
}

// Error subtypes
export class CrusoeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrusoeError';
  }
}
export class AuthError extends CrusoeError {
  constructor(message: string) { super(message); this.name = 'AuthError'; }
}
export class RateLimitError extends CrusoeError {
  constructor(message: string) { super(message); this.name = 'RateLimitError'; }
}
export class ServerError extends CrusoeError {
  constructor(message: string) { super(message); this.name = 'ServerError'; }
}
export class TimeoutError extends CrusoeError {
  constructor(message: string) { super(message); this.name = 'TimeoutError'; }
}
export class NetworkError extends CrusoeError {
  constructor(message: string) { super(message); this.name = 'NetworkError'; }
}
