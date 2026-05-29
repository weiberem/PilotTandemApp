'use client';

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Legend,
} from 'recharts';
import type { MonthlyStat } from '@/lib/stats';

export function MonthlyChart({ data }: { data: MonthlyStat[] }) {
  const [showRevenue, setShowRevenue] = useState(false);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display font-semibold">Monatliche Übersicht</h2>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox" checked={showRevenue} onChange={e => setShowRevenue(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          Umsatz overlay
        </label>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            {showRevenue && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />}
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8 }}
              formatter={(v: number, name: string) =>
                name === 'Umsatz' ? `CHF ${v.toFixed(0)}` : v
              }
            />
            <Legend />
            <Bar yAxisId="left" dataKey="flights" name="Flüge" fill="#E08A0B" radius={[4, 4, 0, 0]} />
            {showRevenue && (
              <Line
                yAxisId="right" type="monotone" dataKey="revenue" name="Umsatz"
                stroke="#13293D" strokeWidth={2} dot={{ r: 3 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
