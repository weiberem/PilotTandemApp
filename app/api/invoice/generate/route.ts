import { NextResponse, type NextRequest } from 'next/server';
import { assembleInvoice } from '@/lib/invoiceAssemble';
import { generateInvoiceXlsx } from '@/lib/invoiceGenerator';
import { generateInvoicePdf } from '@/lib/pdfGenerator';
import { monthLabelDe } from '@/lib/invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/invoice/generate?month=2025-01-01&company=Skywings&format=xlsx|pdf
 * Streams the freshly-generated file as an attachment. Does NOT mark as sent
 * and does NOT increment the invoice counter — that happens in /send.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const monthFirst = url.searchParams.get('month') ?? '';
  const company = url.searchParams.get('company') ?? 'Skywings';
  const format = (url.searchParams.get('format') ?? 'pdf') as 'pdf' | 'xlsx';

  if (!/^\d{4}-\d{2}-01$/.test(monthFirst)) {
    return NextResponse.json({ error: 'invalid month (need YYYY-MM-01)' }, { status: 400 });
  }

  const assembled = await assembleInvoice({ monthFirst, company });
  if ('error' in assembled) {
    return NextResponse.json({ error: assembled.error }, { status: 400 });
  }

  const invoiceNumber = `PREVIEW-${monthFirst.slice(0, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const args = {
    pilot: assembled.pilot,
    company: assembled.company,
    rates: assembled.rates,
    monthFirst,
    invoiceNumber,
    invoiceDate: today,
    rows: assembled.rows,
    totals: assembled.totals,
  };

  const fileBase = `Rechnung_${monthFirst.slice(0, 7).replace('-', '_')}_${company.replace(/\s+/g, '_')}_PREVIEW`;
  if (format === 'xlsx') {
    const buf = await generateInvoiceXlsx(args);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  } else {
    const buf = await generateInvoicePdf(args);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileBase}.pdf"`,
        'X-Invoice-Month': monthLabelDe(monthFirst),
      },
    });
  }
}
