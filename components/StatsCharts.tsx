'use client';

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Legend, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';
import type { MonthlyStat } from '@/lib/stats';
import { formatChf } from '@/lib/utils';

export function MonthlyChart({ data }: { data: MonthlyStat[] }) {
  const [showRevenue, setShowRevenue] = useState(false);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display font-semibold">Monthly overview</h2>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox" checked={showRevenue} onChange={e => setShowRevenue(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          Revenue overlay
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
                name === 'Revenue' ? `CHF ${v.toFixed(0)}` : v
              }
            />
            <Legend />
            <Bar yAxisId="left" dataKey="flights" name="Flights" fill="#E08A0B" radius={[4, 4, 0, 0]} />
            {showRevenue && (
              <Line
                yAxisId="right" type="monotone" dataKey="revenue" name="Revenue"
                stroke="#13293D" strokeWidth={2} dot={{ r: 3 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const PHOTO_COLORS = { pp: '#13293D', cc: '#E08A0B', cash: '#4F9D69', none: '#CBD5E1' };

export type DayStat = {
  date: string;
  monthIndex0: number;
  flights: number;
  pp: number;
  cc: number;
  cash: number;
  none: number;
  photo: number;
  photoChf: number;
  revenue: number;
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-bg-subtle/60 p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="font-display font-bold text-xl leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

/**
 * Extended statistics: pick a scope (whole year or a single month) and see
 * KPIs (flights, avg per working day, photo-sale rate, photo revenue), the
 * photo payment split as a donut, and a bar chart — stacked PP/CC/Cash per
 * month for the year, or flights-per-day with an average line for a month.
 */
export function StatsInsights({
  year, months, dailyStats,
}: {
  year: number;
  months: MonthlyStat[];
  dailyStats: DayStat[];
}) {
  const monthsWithData = months.filter(m => m.flights > 0);
  const [scope, setScope] = useState<string>('year');

  const days = scope === 'year'
    ? dailyStats
    : dailyStats.filter(d => String(d.monthIndex0) === scope);

  const agg = days.reduce((a, d) => ({
    flights: a.flights + d.flights, pp: a.pp + d.pp, cc: a.cc + d.cc, cash: a.cash + d.cash,
    none: a.none + d.none, photo: a.photo + d.photo, photoChf: a.photoChf + d.photoChf,
    revenue: a.revenue + d.revenue,
  }), { flights: 0, pp: 0, cc: 0, cash: 0, none: 0, photo: 0, photoChf: 0, revenue: 0 });

  const workedDays = days.length;
  const avgPerDay = workedDays ? agg.flights / workedDays : 0;
  const photoRate = agg.flights ? (agg.photo / agg.flights) * 100 : 0;

  const donut = [
    { name: 'PP', value: agg.pp, color: PHOTO_COLORS.pp },
    { name: 'CC', value: agg.cc, color: PHOTO_COLORS.cc },
    { name: 'Cash', value: agg.cash, color: PHOTO_COLORS.cash },
    { name: 'Kein Foto', value: agg.none, color: PHOTO_COLORS.none },
  ].filter(d => d.value > 0);

  const monthBars = monthsWithData.map(m => ({
    label: m.label.slice(0, 3),
    PP: m.pp, CC: m.cc, Cash: m.cash,
    'Kein Foto': Math.max(0, m.flights - m.pp - m.cc - m.cash),
  }));
  const dayBars = days
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ label: d.date.slice(8, 10), flights: d.flights }));

  const hasData = agg.flights > 0;

  return (
    <div className="card p-4 space-y-4" data-tour="stats-insights">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display font-semibold text-lg">Insights</h2>
        <select
          value={scope}
          onChange={e => setScope(e.target.value)}
          className="min-h-tap rounded-lg border border-border px-3 py-1.5 bg-white text-sm"
        >
          <option value="year">Ganzes Jahr {year}</option>
          {monthsWithData.map(m => (
            <option key={m.monthIndex0} value={String(m.monthIndex0)}>{m.label}</option>
          ))}
        </select>
      </div>

      {!hasData ? (
        <p className="text-sm text-text-muted">Noch keine Flüge in diesem Zeitraum.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi label="Flüge" value={String(agg.flights)} sub={`${workedDays} Arbeitstag${workedDays === 1 ? '' : 'e'}`} />
            <Kpi label="Ø Flüge / Tag" value={avgPerDay.toFixed(1)} />
            <Kpi label="Foto-Quote" value={`${photoRate.toFixed(0)} %`} sub={`${agg.photo} von ${agg.flights} Flügen`} />
            <Kpi label="Foto-Umsatz" value={formatChf(agg.photoChf)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <div className="text-xs text-text-muted mb-1">Foto-Verteilung</div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut} dataKey="value" nameKey="name"
                      innerRadius="55%" outerRadius="85%" paddingAngle={2}
                    >
                      {donut.map(d => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8 }}
                      formatter={(v: number, n: string) => [`${v} (${agg.flights ? ((v / agg.flights) * 100).toFixed(0) : 0} %)`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs">
                {donut.map(d => (
                  <li key={d.name} className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                    {d.name} <span className="text-text-muted">{((d.value / agg.flights) * 100).toFixed(0)} %</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-xs text-text-muted mb-1">
                {scope === 'year' ? 'Fotos pro Monat (PP / CC / Cash / kein Foto)' : 'Flüge pro Tag'}
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {scope === 'year' ? (
                    <BarChart data={monthBars} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="PP" stackId="a" fill={PHOTO_COLORS.pp} />
                      <Bar dataKey="CC" stackId="a" fill={PHOTO_COLORS.cc} />
                      <Bar dataKey="Cash" stackId="a" fill={PHOTO_COLORS.cash} />
                      <Bar dataKey="Kein Foto" stackId="a" fill={PHOTO_COLORS.none} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  ) : (
                    <BarChart data={dayBars} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8 }} />
                      <ReferenceLine y={avgPerDay} stroke="#13293D" strokeDasharray="4 4"
                        label={{ value: `Ø ${avgPerDay.toFixed(1)}`, fontSize: 10, fill: '#13293D', position: 'insideTopRight' }} />
                      <Bar dataKey="flights" name="Flüge" fill={PHOTO_COLORS.cc} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
