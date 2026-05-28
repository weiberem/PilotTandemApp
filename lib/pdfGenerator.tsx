import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import {
  applyVat, type InvoiceCompanyInfo, type InvoiceDayRow, type InvoicePilotInfo,
  type InvoiceTotals, monthLabelDe,
} from './invoice';
import type { PilotRates } from './flights';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  row: { flexDirection: 'row' },
  spread: { flexDirection: 'row', justifyContent: 'space-between' },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  h1: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  small: { fontSize: 8, color: '#666' },
  table: { marginTop: 16, borderBottom: '1pt solid #000' },
  th: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    paddingVertical: 4,
    borderBottom: '1pt solid #000',
    flexDirection: 'row',
  },
  td: {
    paddingVertical: 2,
    flexDirection: 'row',
    fontSize: 9,
  },
  totalRow: {
    flexDirection: 'row',
    borderTop: '1pt solid #000',
    paddingVertical: 4,
    fontFamily: 'Helvetica-Bold',
  },
  cellDate: { width: '8%' },
  cellNum: { width: '20%', textAlign: 'center' },
  cellAmount: { width: '12%', textAlign: 'right' },
  footer: { marginTop: 24, flexDirection: 'row', justifyContent: 'space-between' },
});

export type InvoicePdfArgs = {
  pilot: InvoicePilotInfo;
  company: InvoiceCompanyInfo;
  rates: PilotRates;
  monthFirst: string;
  invoiceNumber: string;
  invoiceDate: string;
  rows: InvoiceDayRow[];
  totals: InvoiceTotals;
};

export function InvoicePdfDoc(args: InvoicePdfArgs) {
  const { vat, net } = applyVat(args.totals.amount, args.pilot.vat_rate);
  return (
    <Document
      author="TandemLog"
      title={`Rechnung ${args.invoiceNumber} ${monthLabelDe(args.monthFirst)}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.spread}>
          <View>
            <Text style={styles.bold}>{args.pilot.full_name}</Text>
            {args.pilot.address_line1 && <Text>{args.pilot.address_line1}</Text>}
            {args.pilot.address_line2 && <Text>{args.pilot.address_line2}</Text>}
            <Text>{[args.pilot.postal_code, args.pilot.city].filter(Boolean).join(' ')}</Text>
          </View>
          <View>
            <Text style={styles.bold}>{args.company.name}</Text>
            {args.company.address && <Text>{args.company.address}</Text>}
          </View>
        </View>

        <View style={[styles.spread, { marginTop: 24 }]}>
          <View>
            <Text style={styles.h1}>ABRECHNUNG</Text>
            <Text style={styles.italic}>{monthLabelDe(args.monthFirst)}</Text>
          </View>
          <View>
            <Text>Nr. {args.invoiceNumber}</Text>
            <Text>{args.invoiceDate}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.cellDate}>Datum</Text>
            <Text style={styles.cellNum}>Flüge à CHF {args.rates.flight_rate_chf}.-</Text>
            <Text style={styles.cellNum}>F/V à CHF {args.rates.photo_prepaid_rate_chf}.-</Text>
            <Text style={styles.cellNum}>Thermal à CHF {args.rates.thermal_rate_chf}.-</Text>
            <Text style={styles.cellNum}>No Show à CHF {args.rates.no_show_rate_chf}.-</Text>
            <Text style={styles.cellAmount}>Betrag CHF</Text>
          </View>
          {args.rows.map(r => (
            <View key={r.day} style={styles.td}>
              <Text style={styles.cellDate}>{String(r.day).padStart(2, '0')}</Text>
              <Text style={styles.cellNum}>{r.flights || ''}</Text>
              <Text style={styles.cellNum}>{r.pp || ''}</Text>
              <Text style={styles.cellNum}>{r.thermal || ''}</Text>
              <Text style={styles.cellNum}>{r.noShow || ''}</Text>
              <Text style={styles.cellAmount}>{r.amount || ''}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.cellDate}>Total</Text>
            <Text style={styles.cellNum}>{args.totals.flights}</Text>
            <Text style={styles.cellNum}>{args.totals.pp}</Text>
            <Text style={styles.cellNum}>{args.totals.thermal}</Text>
            <Text style={styles.cellNum}>{args.totals.noShow}</Text>
            <Text style={styles.cellAmount}>CHF {args.totals.amount.toFixed(0)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View>
            <Text style={styles.bold}>Bankverbindung:</Text>
            <Text>IBAN: {args.pilot.iban ?? ''}</Text>
          </View>
          <View>
            <Text>Betrag inklusive {(args.pilot.vat_rate * 100).toFixed(1)}% MwSt.</Text>
            {args.pilot.vat_number && <Text>MwSt.-Nr.: {args.pilot.vat_number}</Text>}
            <Text style={styles.small}>Netto: {net.toFixed(2)} CHF · MwSt: {vat.toFixed(2)} CHF</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(args: InvoicePdfArgs): Promise<Buffer> {
  return await renderToBuffer(InvoicePdfDoc(args));
}
