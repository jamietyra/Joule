import { createSqliteAdapter } from './_sqlite-adapter';

export interface CallLogRecord {
  id: string;
  ts: number;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  carbonGrams: number;
  costUsd: number;
  source: 'static' | 'header';
  routingDecision: { modelId: string; intent: string; reason: string };
  personaTag?: string;
}

export interface CallLog {
  appendCallLog(record: CallLogRecord): void;
  readCallLog(filter?: { modelId?: string }): CallLogRecord[];
  aggregateSavings(): {
    totalCarbonGrams: number;
    totalCostUsd: number;
    superCallCount: number;
    nanoCallCount: number;
  };
}

export function createCallLog(dbPath: string): CallLog {
  const adapter = createSqliteAdapter(dbPath);

  return {
    appendCallLog(record: CallLogRecord): void {
      adapter.insert(record);
    },

    readCallLog(filter?: { modelId?: string }): CallLogRecord[] {
      return adapter.selectAll(filter);
    },

    aggregateSavings() {
      return adapter.aggregate();
    },
  };
}
