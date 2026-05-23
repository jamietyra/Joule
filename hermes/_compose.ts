import type { ReportData } from './_query';

const fmt = (n: number, decimals = 2) => n.toFixed(decimals);

export function composeWeeklyReportHtml(data: ReportData): string {
  const { summary, top3 } = data;

  // Recommendation: if nano ratio is < 50%, suggest more summarize routing
  const total = summary.superCallCount + summary.nanoCallCount;
  const nanoRatio = total > 0 ? summary.nanoCallCount / total : 0;
  const recommendationText = nanoRatio < 0.5
    ? `Nano 비중을 50% 이상으로 늘리면 카본·비용 추가 절감 여지가 큽니다 (현재 ${(nanoRatio * 100).toFixed(0)}%).`
    : `Nano 비중 ${(nanoRatio * 100).toFixed(0)}% — 충분합니다. 시간대 라우팅 도입 시 추가 절감 가능.`;

  const top3Rows = top3.length === 0
    ? `<tr><td colspan="4">데이터 없음</td></tr>`
    : top3.map((r) => `
        <tr>
          <td>${escapeHtml(new Date(r.ts).toISOString())}</td>
          <td>${escapeHtml(r.modelId)}</td>
          <td>${fmt(r.carbonGrams, 3)}g</td>
          <td>$${fmt(r.costUsd, 5)}</td>
        </tr>
      `).join('');

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>Joule Weekly Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 24px auto; color: #1a1a1a; }
  h2 { border-bottom: 2px solid #2563eb; padding-bottom: 4px; }
  .stat { display: inline-block; margin-right: 24px; }
  .stat .num { font-size: 28px; font-weight: 700; color: #2563eb; }
  .stat .label { font-size: 12px; color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; }
  th { background: #f3f4f6; }
  .reco { background: #fef3c7; padding: 12px; border-radius: 6px; }
</style></head><body>

<h1>Joule — 주간 리포트</h1>

<h2>1. 누적 절감</h2>
<div>
  <div class="stat"><div class="num">${fmt(summary.totalCarbonGrams, 2)}g</div><div class="label">CO₂ 누적</div></div>
  <div class="stat"><div class="num">$${fmt(summary.totalCostUsd, 4)}</div><div class="label">비용 누적</div></div>
  <div class="stat"><div class="num">${summary.totalCalls}</div><div class="label">총 호출</div></div>
  <div class="stat"><div class="num">${summary.nanoCallCount}</div><div class="label">Nano 호출</div></div>
  <div class="stat"><div class="num">${summary.superCallCount}</div><div class="label">Super 호출</div></div>
</div>

<h2>2. Top 3 호출 (비용 기준)</h2>
<table>
  <thead><tr><th>시각</th><th>모델</th><th>탄소</th><th>비용</th></tr></thead>
  <tbody>${top3Rows}</tbody>
</table>

<h2>3. 권장 액션</h2>
<div class="reco">${escapeHtml(recommendationText)}</div>

</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
