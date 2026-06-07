import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, Circle, FileText, Send, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { yearStats } from '@/lib/stats';
import { getMonthVerificationStatus } from '@/lib/dayVerify';
import { MonthlyChart } from '@/components/StatsCharts';
import { VkpiReminder } from '@/components/VkpiReminder';
import { YearPicker } from './YearPicker';
import { formatChf } from '@/lib/utils';
import { computeDayTotals, type FlightRow, type PilotRates } from '@/lib/flights';
import { monthLabelDe } from '@/lib/invoice';

export const dynamic = 'force-dynamic';

function monthFirst(year: number, monthIndex0: number): string {
  const d = new Date(year, monthIndex0, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastDayOf(monthFirstIso: string): string {
  const [y, m] = monthFirstIso.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${monthFirstIso.slice(0, 8)}${String(last).padStart(2, '0')}`;
}

export default async function StatsPage({
  searchParams,
}: { searchParams: { year?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const now = new Date();
  const currentYear = now.getFullYear();
  const year = /^\d{4}$/.test(searchParams.year ?? '') ? Number(searchParams.year) : currentYear;

  // Three most recent months: previous-previous, previous (default invoice month), current.
  const billingMonths = [
    monthFirst(now.getFullYear(), now.getMonth() - 2),
    monthFirst(now.getFullYear(), now.getMonth() - 1),
    monthFirst(now.getFullYear(), now.getMonth()),
  ];
  const billingStart = billingMonths[0];
  const billingEnd = lastDayOf(billingMonths[2]);

  const [{ data: pilot }, { data: yearFlights }, { data: billingFlights }, { data: invoiceRows }, verifications] = await Promise.all([
    supabase.from('pilots').select(
      'primary_company_name, flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf',
    ).eq('id', user.id).maybeSingle(),
    supabase.from('flights').select('*')
      .gte('flight_date', `${year}-01-01`).lte('flight_date', `${year}-12-31`),
    supabase.from('flights').select('flight_date, company, photo_status, is_no_show, is_double_airtime, tip_chf')
      .gte('flight_date', billingStart).lte('flight_date', billingEnd),
    supabase.from('invoices').select('month, company, invoice_number, sent_at, status')
      .in('month', billingMonths),
    Promise.all(billingMonths.map(m => getMonthVerificationStatus(user.id, m))),
  ]);

  const rates: PilotRates = {
    flight_rate_chf: Number(pilot?.flight_rate_chf ?? 105),
    photo_prepaid_rate_chf: Number(pilot?.photo_prepaid_rate_chf ?? 40),
    thermal_rate_chf: Number(pilot?.thermal_rate_chf ?? 50),
    no_show_rate_chf: Number(pilot?.no_show_rate_chf ?? 32),
  };
  const primaryCompany = pilot?.primary_company_name ?? 'Skywings';
  const stats = yearStats((yearFlights ?? []) as FlightRow[], rates, year, primaryCompany);

  // Optional column from migration 007 — fetch separately so the page still
  // works before the migration is applied.
  let reportedYears: number[] = [];
  const { data: vkpiRow } = await supabase
    .from('pilots').select('vkpi_reported_years').eq('id', user.id).maybeSingle();
  if (vkpiRow && Array.isArray((vkpiRow as { vkpi_reported_years?: unknown }).vkpi_reported_years)) {
    reportedYears = ((vkpiRow as { vkpi_reported_years: number[] }).vkpi_reported_years) ?? [];
  }

  const yearIsComplete = year < currentYear;
  const yearReported = reportedYears.includes(year);

  // Group billing flights by month + company.
  type Group = { month: string; company: string; flights: number; amount: number };
  const groupMap = new Map<string, Group>();
  for (const f of billingFlights ?? []) {
    const m = (f.flight_date as string).slice(0, 7) + '-01';
    const c = (f.company as string) || 'Unbekannt';
    const key = `${m}__${c}`;
    let g = groupMap.get(key);
    if (!g) { g = { month: m, company: c, flights: 0, amount: 0 }; groupMap.set(key, g); }
    g.flights += 1;
  }
  // Amounts (re-iterate, computing per group with the flight rows so we use the same totals math).
  for (const [key, g] of groupMap) {
    const rows = (billingFlights ?? []).filter(
      f => (f.flight_date as string).startsWith(g.month.slice(0, 7)) && (f.company as string) === g.company,
    );
    g.amount = computeDayTotals(rows as Pick<FlightRow, 'photo_status' | 'is_no_show' | 'is_double_airtime' | 'tip_chf'>[], rates).totalChf;
  }
  const groups = [...groupMap.values()];

  const invoiceByKey = new Map<string, { invoice_number: string | null; sent_at: string | null; status: string | null }>();
  for (const inv of invoiceRows ?? []) {
    invoiceByKey.set(`${inv.month}__${inv.company}`, {
      invoice_number: (inv.invoice_number as string) ?? null,
      sent_at: (inv.sent_at as string) ?? null,
      status: (inv.status as string) ?? null,
    });
  }

  const verificationByMonth = new Map(billingMonths.map((m, i) => [m, verifications[i]]));

  // Per-month rendering data, newest first.
  const monthBlocks = billingMonths
    .slice()
    .reverse()
    .map(m => ({
      month: m,
      label: monthLabelDe(m),
      verification: verificationByMonth.get(m)!,
      groups: groups.filter(g => g.month === m).sort((a, b) => b.flights - a.flights),
    }));

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="p-4 lg:p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Rechnung & Stats</h1>
          <p className="text-text-muted text-sm">{primaryCompany} · Jahr {year}</p>
        </div>
        <YearPicker year={year} options={yearOptions} />
      </div>

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg">Monatsabrechnung</h2>
        {monthBlocks.map(block => (
          <MonthBillingCard
            key={block.month}
            month={block.month}
            label={block.label}
            verification={block.verification}
            groups={block.groups}
            invoiceByKey={invoiceByKey}
          />
        ))}
      </section>

      {yearIsComplete && (
        <VkpiReminder year={year} count={stats.vkpiFlights} reported={yearReported} />
      )}

      <MonthlyChart data={stats.months} />

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-display font-semibold mb-2">Jahresdetail</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted text-xs uppercase">
              <th className="py-1">Monat</th>
              <th className="text-right">Flüge</th>
              <th className="text-right">PP</th>
              <th className="text-right">Thermal</th>
              <th className="text-right">No-Show</th>
              <th className="text-right">Umsatz</th>
            </tr>
          </thead>
          <tbody>
            {stats.months.map(m => {
              const monthFirstStr = `${year}-${String(m.monthIndex0 + 1).padStart(2, '0')}-01`;
              return (
                <tr key={m.monthIndex0} className="border-t border-border hover:bg-bg">
                  <td className="py-1">
                    <Link
                      href={`/dashboard/invoice?month=${monthFirstStr}&company=${encodeURIComponent(primaryCompany)}`}
                      className="text-primary hover:underline"
                    >
                      {m.label}
                    </Link>
                  </td>
                  <td className="font-mono text-right">{m.flights}</td>
                  <td className="font-mono text-right">{m.pp}</td>
                  <td className="font-mono text-right">{m.thermal}</td>
                  <td className="font-mono text-right">{m.noShow}</td>
                  <td className="font-mono text-right">{formatChf(m.revenue)}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-text font-semibold">
              <td className="py-1">Total</td>
              <td className="font-mono text-right">{stats.totals.flights}</td>
              <td className="font-mono text-right">{stats.totals.pp}</td>
              <td className="font-mono text-right">{stats.totals.thermal}</td>
              <td className="font-mono text-right">{stats.totals.noShow}</td>
              <td className="font-mono text-right">{formatChf(stats.totals.revenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Group = { month: string; company: string; flights: number; amount: number };
type Verification = { total: number; verified: number; unverifiedDates: string[]; ready: boolean };
type InvoiceMap = Map<string, { invoice_number: string | null; sent_at: string | null; status: string | null }>;

function MonthBillingCard({
  month, label, verification, groups, invoiceByKey,
}: {
  month: string;
  label: string;
  verification: Verification;
  groups: Group[];
  invoiceByKey: InvoiceMap;
}) {
  const totalFlights = groups.reduce((s, g) => s + g.flights, 0);
  const totalAmount = groups.reduce((s, g) => s + g.amount, 0);

  return (
    <div className="card overflow-hidden">
      <div className="p-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display font-semibold capitalize">{label}</div>
          <div className="text-xs text-text-muted">
            {totalFlights === 0 ? 'Keine Flüge' : `${totalFlights} Flüge · ${groups.length} Firma${groups.length === 1 ? '' : 'en'}`}
          </div>
        </div>
        <div className="font-mono font-semibold">{formatChf(totalAmount)}</div>
      </div>

      {totalFlights === 0 ? (
        <p className="p-3 text-text-muted text-sm">—</p>
      ) : (
        <>
          <div className="px-3 py-2 text-xs border-b border-border flex items-center gap-2">
            {verification.ready ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check className="w-3.5 h-3.5" /> Alle {verification.total} Flugtage verifiziert
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warning">
                <Circle className="w-3.5 h-3.5" />
                {verification.verified} von {verification.total} Tagen verifiziert
                {verification.unverifiedDates.length > 0 && (
                  <span className="text-text-muted ml-1">
                    (offen: {verification.unverifiedDates.slice(0, 3).map(d => d.split('-').reverse().join('.')).join(', ')}{verification.unverifiedDates.length > 3 ? '…' : ''})
                  </span>
                )}
              </span>
            )}
          </div>
          <ul className="divide-y divide-border">
            {groups.map(g => {
              const inv = invoiceByKey.get(`${g.month}__${g.company}`);
              const sent = inv?.status === 'sent';
              return (
                <li key={`${g.month}__${g.company}`} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{g.company}</div>
                    <div className="text-xs text-text-muted">
                      {g.flights} Flüge · <span className="font-mono">{formatChf(g.amount)}</span>
                      {sent && inv?.invoice_number && (
                        <span className="ml-2 inline-flex items-center gap-1 text-success">
                          <Check className="w-3 h-3" /> {inv.invoice_number} gesendet
                        </span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/invoice?month=${month}&company=${encodeURIComponent(g.company)}`}
                    className={sent ? 'btn-ghost border border-border text-sm' : 'btn-primary text-sm'}
                  >
                    {sent ? <FileText className="w-4 h-4 mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
                    {sent ? 'Ansehen' : verification.ready ? 'Senden →' : 'Öffnen →'}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
