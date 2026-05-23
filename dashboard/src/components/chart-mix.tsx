'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

export interface ChartMixProps {
  superCount: number;
  nanoCount: number;
}

const COLORS = ['#2563eb', '#10b981']; // super = blue, nano = green

export function ChartMix({ superCount, nanoCount }: ChartMixProps) {
  const data = [
    { name: 'Super', value: superCount },
    { name: 'Nano', value: nanoCount },
  ];
  return (
    <div data-chart="mix" style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            label={(entry) => `${entry.name}: ${entry.value}`}
          >
            {data.map((entry, idx) => (
              <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
