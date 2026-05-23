import { ChartSavings, type DailyAggregate } from '@/components/chart-savings';
import { ChartMix } from '@/components/chart-mix';
import { readAll, aggregateSavings } from '@/lib/storage';

export const dynamic = 'force-dynamic';

function buildDailyAggregates(records: ReturnType<typeof readAll>): DailyAggregate[] {
  const byDay = new Map<string, { carbon: number; cost: number }>();
  for (const r of records) {
    const day = new Date(r.ts).toISOString().slice(0, 10); // YYYY-MM-DD
    const prev = byDay.get(day) ?? { carbon: 0, cost: 0 };
    byDay.set(day, {
      carbon: prev.carbon + r.carbonGrams,
      cost: prev.cost + r.costUsd,
    });
  }
  // Sort by day ascending
  const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  // Cumulative
  const result: DailyAggregate[] = [];
  let cumCarbon = 0;
  let cumCost = 0;
  for (const [day, { carbon, cost }] of days) {
    cumCarbon += carbon;
    cumCost += cost;
    result.push({
      day: day.slice(5), // "MM-DD"
      cumulativeCarbonGrams: Number(cumCarbon.toFixed(2)),
      cumulativeCostUsd: Number(cumCost.toFixed(4)),
    });
  }
  return result;
}

export default function Home() {
  const records = readAll();
  const dailyAggs = buildDailyAggregates(records);
  const agg = aggregateSavings();

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 8 }}>Joule — Carbon-aware AI Gateway</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        총 {records.length}건 호출 · CO₂ {agg.totalCarbonGrams.toFixed(2)}g · 비용 ${agg.totalCostUsd.toFixed(4)}
      </p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>누적 절감 (30일)</h2>
        <ChartSavings data={dailyAggs} />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>Super / Nano 호출 분포</h2>
        <ChartMix superCount={agg.superCallCount} nanoCount={agg.nanoCallCount} />
      </section>
    </main>
  );
}
