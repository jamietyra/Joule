"use client"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export interface DailyAggregate {
  day: string // ISO date or "MM-DD"
  cumulativeCarbonGrams: number
  cumulativeCostUsd: number
}

export interface ChartSavingsProps {
  data: DailyAggregate[]
}

export function ChartSavings({ data }: ChartSavingsProps) {
  return (
    <div data-chart="savings" style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 12, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="cumulativeCarbonGrams"
            stroke="#10b981"
            name="누적 CO2 (g)"
            dot={(props) => {
              const { cx, cy, index } = props
              return <circle key={index} cx={cx} cy={cy} r={3} fill="#10b981" data-bar="carbon" />
            }}
          />
          <Line
            type="monotone"
            dataKey="cumulativeCostUsd"
            stroke="#2563eb"
            name="누적 비용 ($)"
            dot={(props) => {
              const { cx, cy, index } = props
              return <circle key={index} cx={cx} cy={cy} r={3} fill="#2563eb" data-bar="cost" />
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
