import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { measure } from './index';

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

interface Measurement {
  carbonGrams: number;
  costUsd: number;
  source: 'static' | 'header';
}

describe('carbon/measure', () => {
  describe('test 1: static branch (header=undefined)', () => {
    it('should return static measurement for nano model with no header', () => {
      const input = {
        modelId: 'nano-30b-a3b',
        promptTokens: 500,
        completionTokens: 500,
      };

      const result = measure(input, undefined);

      expect(result.source).toBe('static');
      expect(result.carbonGrams).toBe(0.45); // Nano: 0.45g per 1k tokens × 1k total = 0.45g
      expect(result.costUsd).toBe(0.0002); // Nano: $0.0002 per 1k tokens × 1k = $0.0002
    });
  });

  describe('test 2: header branch (valid positive number)', () => {
    it('should use header carbonGrams when provided, but cost from static', () => {
      const input = {
        modelId: 'nano-30b-a3b',
        promptTokens: 500,
        completionTokens: 500,
      };

      const result = measure(input, 1.7);

      expect(result.source).toBe('header');
      expect(result.carbonGrams).toBe(1.7); // Header value, not static
      expect(result.costUsd).toBe(0.0002); // Cost always from static
    });
  });

  describe('test 3: header invalid (negative, NaN, Infinity) → fallback to static', () => {
    it('should fallback to static when header is negative', () => {
      const input = {
        modelId: 'nano-30b-a3b',
        promptTokens: 500,
        completionTokens: 500,
      };

      const result = measure(input, -1);

      expect(result.source).toBe('static');
      expect(result.carbonGrams).toBe(0.45);
      expect(result.costUsd).toBe(0.0002);
    });

    it('should fallback to static when header is NaN', () => {
      const input = {
        modelId: 'nano-30b-a3b',
        promptTokens: 500,
        completionTokens: 500,
      };

      const result = measure(input, NaN);

      expect(result.source).toBe('static');
      expect(result.carbonGrams).toBe(0.45);
      expect(result.costUsd).toBe(0.0002);
    });

    it('should fallback to static when header is Infinity', () => {
      const input = {
        modelId: 'nano-30b-a3b',
        promptTokens: 500,
        completionTokens: 500,
      };

      const result = measure(input, Infinity);

      expect(result.source).toBe('static');
      expect(result.carbonGrams).toBe(0.45);
      expect(result.costUsd).toBe(0.0002);
    });
  });

  describe('test 4: modelId unknown → default to Super with console.warn', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('should fallback to Super pricing and warn when modelId is unknown', () => {
      const input = {
        modelId: 'gpt-99-mega',
        promptTokens: 500,
        completionTokens: 500,
      };

      const result = measure(input, undefined);

      expect(result.source).toBe('static');
      expect(result.carbonGrams).toBe(4.2); // Super: 4.2g per 1k tokens × 1k = 4.2g
      expect(result.costUsd).toBe(0.0024); // Super: $0.0024 per 1k tokens × 1k = $0.0024

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('gpt-99-mega'));
    });
  });
});
