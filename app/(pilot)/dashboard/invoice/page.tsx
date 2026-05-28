import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { assembleInvoice } from '@/lib/invoiceAssemble';
import { InvoiceComparisonView } from '@/components/InvoiceComparisonView';
import { monthLabelDe } from '@/lib/invoice';
import { MonthCompanyPicker } from './MonthCompanyPicker';

export const dynamic = 'force-dynamic';

function defaultMonth(): string {
  // Default to last full month — invoicing usually happens on the 1st of the next.
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export default async function InvoiceDashboardPage({
  searchParams,
}: { searchParams: { month?: string; company?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase
    .from('pilots')
    .select('primary_company_name, full_name, iban')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot?.iban) redirect('/settings?welcome=1');

  const monthFirst = /^\d{4}-\d{2}-01$/.test(searchParams.month ?? '')
    ? (searchParams.month as string)
    : defaultMonth();
  const companyKey = searchParams.company || 'Skywings';

  const [assembled, { data: invoiceRow }] = await Promise.all([
    assembleInvoice({ monthFirst, company: companyKey }),
    supabase
      .from('invoices')
      .select('invoice_number, sent_at, status')
      .eq('month', monthFirst)
      .eq('company', companyKey)
      .maybeSingle(),
  ]);

  if ('error' in assembled) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <h1 className="text-2xl font-display font-bold mb-2">Rechnung</h1>
        <div className="card p-4 text-danger">Fehler: {assembled.error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1280px] mx-auto space-y-4">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Rechnung</h1>
          <p className="text-text-muted text-sm">{monthLabelDe(monthFirst)} · {companyKey}</p>
        </div>
        <MonthCompanyPicker
          month={monthFirst}
          company={companyKey}
          primaryCompany={pilot.primary_company_name ?? 'Skywings'}
        />
      </div>

      <InvoiceComparisonView
        pilot={assembled.pilot}
        company={assembled.company}
        companyKey={companyKey}
        rates={assembled.rates}
        monthFirst={monthFirst}
        rows={assembled.rows}
        totals={assembled.totals}
        flights={assembled.flights}
        alreadySent={{
          invoiceNumber: invoiceRow?.status === 'sent' ? invoiceRow.invoice_number ?? null : null,
          sentAt: invoiceRow?.sent_at ?? null,
        }}
      />
    </div>
  );
}
