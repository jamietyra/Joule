import { createCallLog, type CallLogRecord } from '../src/storage/index';

export interface ReportSummary {
  totalCarbonGrams: number;
  totalCostUsd: number;
  superCallCount: number;
  nanoCallCount: number;
  totalCalls: number;
}

export interface ReportData {
  summary: ReportSummary;
  top3: CallLogRecord[];
}

export function queryReportData(dbPath: string): ReportData {
  const storage = createCallLog(dbPath);
  const agg = storage.aggregateSavings();
  const all = storage.readCallLog();
  const top3 = [...all].sort((a, b) => b.costUsd - a.costUsd).slice(0, 3);
  return {
    summary: {
      totalCarbonGrams: agg.totalCarbonGrams,
      totalCostUsd: agg.totalCostUsd,
      superCallCount: agg.superCallCount,
      nanoCallCount: agg.nanoCallCount,
      totalCalls: all.length,
    },
    top3,
  };
}
