import { NextResponse, type NextRequest } from 'next/server';
import { assembleInvoice } from '@/lib/invoiceAssemble';
import { generateInvoiceXlsx } from '@/lib/invoiceGenerator';
import { generateInvoicePdf } from '@/lib/pdfGenerator';
import { reserveNextInvoiceNumber } from '@/lib/invoiceNumber';
import { refreshAccessToken, uploadToDriveFolder } from '@/lib/googleDrive';
import { getResend, getFromAddress } from '@/lib/email';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { monthLabelDe } from '@/lib/invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { month?: string; company?: string };
  const monthFirst = body.month ?? '';
  const company = body.company ?? 'Skywings';
  if (!/^\d{4}-\d{2}-01$/.test(monthFirst)) {
    return NextResponse.json({ error: 'invalid month' }, { status: 400 });
  }

  const assembled = await assembleInvoice({ monthFirst, company });
  if ('error' in assembled) return NextResponse.json({ error: assembled.error }, { status: 400 });

  if (assembled.totals.amount <= 0) {
    return NextResponse.json({ error: 'nothing to invoice for this month' }, { status: 400 });
  }
  if (!assembled.officeEmail) {
    return NextResponse.json({ error: 'office_email missing — set it in Settings' }, { status: 400 });
  }

  // Reserve invoice number atomically.
  const year = Number(monthFirst.slice(0, 4));
  const invoiceNumber = await reserveNextInvoiceNumber(assembled.pilotId, year);
  const today = new Date().toISOString().slice(0, 10);

  const docArgs = {
    pilot: assembled.pilot,
    company: assembled.company,
    rates: assembled.rates,
    monthFirst,
    invoiceNumber,
    invoiceDate: today,
    rows: assembled.rows,
    totals: assembled.totals,
  };

  const [pdfBuf, xlsxBuf] = await Promise.all([
    generateInvoicePdf(docArgs),
    generateInvoiceXlsx(docArgs),
  ]);

  // Upload to Google Drive (best-effort: don't fail the send if Drive isn't set up).
  const baseName = `Rechnung_${monthFirst.slice(0, 7).replace('-', '_')}_${company.replace(/\s+/g, '_')}`;
  let pdfUrl: string | null = null;
  let xlsxUrl: string | null = null;
  if (assembled.driveFolderId) {
    try {
      const { data: pilot } = await sb.from('pilots').select('google_refresh_token').eq('id', user.id).maybeSingle();
      if (pilot?.google_refresh_token) {
        const tokens = await refreshAccessToken(pilot.google_refresh_token);
        const [pdfUp, xlsxUp] = await Promise.all([
          uploadToDriveFolder({
            accessToken: tokens.access_token, folderId: assembled.driveFolderId,
            name: `${baseName}.pdf`, mimeType: 'application/pdf',
            body: pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength) as ArrayBuffer,
          }),
          uploadToDriveFolder({
            accessToken: tokens.access_token, folderId: assembled.driveFolderId,
            name: `${baseName}.xlsx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength) as ArrayBuffer,
          }),
        ]);
        pdfUrl = pdfUp.webViewLink ?? null;
        xlsxUrl = xlsxUp.webViewLink ?? null;
      }
    } catch (e) {
      // Surface as a warning in the response; do not abort the send.
      console.warn('GDrive upload failed:', e);
    }
  }

  // Email via Resend with both attachments.
  const monthName = monthLabelDe(monthFirst);
  const subject = `Rechnung ${monthName} — ${assembled.pilot.full_name}`;
  const text = [
    `Sehr geehrte Damen und Herren`,
    ``,
    `Anbei meine Abrechnung für ${monthName}:`,
    ``,
    `  Flüge:    ${assembled.totals.flights}`,
    `  Foto PP:  ${assembled.totals.pp}`,
    `  Thermal:  ${assembled.totals.thermal}`,
    `  No-Show:  ${assembled.totals.noShow}`,
    `  Total:    CHF ${assembled.totals.amount.toFixed(0)}`,
    ``,
    `Rechnungs-Nr.: ${invoiceNumber}`,
    ``,
    `Freundliche Grüsse`,
    assembled.pilot.full_name,
  ].join('\n');

  const cc = [assembled.personalEmail, assembled.invoiceCcEmail].filter((s): s is string => !!s);

  let emailId: string | null = null;
  try {
    const r = await getResend().emails.send({
      from: getFromAddress(),
      to: assembled.officeEmail,
      cc: cc.length ? cc : undefined,
      subject,
      text,
      attachments: [
        { filename: `${baseName}.pdf`,  content: pdfBuf  },
        { filename: `${baseName}.xlsx`, content: xlsxBuf },
      ],
    });
    emailId = (r as { data?: { id?: string } }).data?.id ?? null;
  } catch (e) {
    return NextResponse.json({ error: 'email_send_failed', detail: String(e) }, { status: 502 });
  }

  // Record the invoice (service client so we can upsert with both unique-key columns
  // even though RLS would also allow it through the user client).
  const svc = createServiceClient();
  const { error: upErr } = await svc.from('invoices').upsert({
    pilot_id: assembled.pilotId,
    month: monthFirst,
    company,
    invoice_number: invoiceNumber,
    status: 'sent',
    total_chf: assembled.totals.amount,
    flights_count: assembled.totals.flights,
    pp_count: assembled.totals.pp,
    thermal_count: assembled.totals.thermal,
    no_show_count: assembled.totals.noShow,
    pdf_url: pdfUrl,
    xlsx_url: xlsxUrl,
    sent_at: new Date().toISOString(),
  }, { onConflict: 'pilot_id,month,company' });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    invoice_number: invoiceNumber,
    email_id: emailId,
    pdf_url: pdfUrl,
    xlsx_url: xlsxUrl,
    drive_uploaded: !!pdfUrl,
  });
}
