'use client';
import { useEffect, useState } from 'react';

type Source = 'static' | 'header' | null;

export function SubtitleSource() {
  const [source, setSource] = useState<Source>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/usage', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { source: Source }) => {
        setSource(j.source);
        setLoading(false);
      })
      .catch(() => {
        setSource(null);
        setLoading(false);
      });
  }, []);

  const label = loading
    ? '측정 소스 확인 중...'
    : source === 'static'
      ? '측정: Joule 환산표 (CO₂)'
      : source === 'header'
        ? '측정: X-Carbon-grams 헤더 직접 (CO₂)'
        : '측정: 데이터 없음';

  const badgeColor =
    source === 'header' ? '#10b981' : source === 'static' ? '#6b7280' : '#9ca3af';

  return (
    <div
      data-subtitle="source"
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 12,
        background: badgeColor,
        color: 'white',
        fontSize: 12,
        marginTop: 8,
      }}
    >
      {label}
    </div>
  );
}
