import { z } from 'zod';

export const PHOTO_STATUSES = ['none', 'PP', 'CC', 'C'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const COMPANIES = ['Skywings', 'AlpinAir', 'Twin Paragliding', 'Other'] as const;
export type Company = (typeof COMPANIES)[number] | string;

export const flightInputSchema = z.object({
  flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trip_time: z.string().regex(/^\d{2}:\d{2}$/),
  company: z.string().min(1).max(60),
  photo_status: z.enum(PHOTO_STATUSES),
  is_no_show: z.boolean(),
  is_double_airtime: z.boolean(),
  tip_chf: z.number().min(0).max(10000),
  notes: z.string().max(500).optional().nullable(),
}).refine(
  v => !v.is_no_show || (v.photo_status === 'none' && !v.is_double_airtime),
  { message: 'No-show flight cannot have a photo or thermal.' },
);

export type FlightInput = z.infer<typeof flightInputSchema>;

export type FlightRow = FlightInput & {
  id: string;
  pilot_id: string;
  created_at: string;
  updated_at: string;
};

export type PilotRates = {
  flight_rate_chf: number;
  photo_prepaid_rate_chf: number;
  thermal_rate_chf: number;
  no_show_rate_chf: number;
};

export type DayTotals = {
  flightsBilled: number;     // non-no-show
  ppCount: number;
  ccCount: number;
  cCount: number;
  thermalCount: number;
  noShowCount: number;
  tipChf: number;
  flightsChf: number;
  ppChf: number;
  ccChf: number;             // 40 CHF per CC-paid photo (kept by pilot, NOT invoiced)
  cChf: number;              // 40 CHF per Cash-paid photo  (kept by pilot, NOT invoiced)
  thermalChf: number;
  noShowChf: number;
  totalChf: number;          // invoice-relevant amount (Skywings sees this)
  personalTotalChf: number;  // totalChf + ccChf + cChf — real earnings
  totalWithTipsChf: number;  // personal total + tips (for daily display)
};

export function computeDayTotals(
  flights: Pick<FlightRow, 'photo_status' | 'is_no_show' | 'is_double_airtime' | 'tip_chf'>[],
  rates: PilotRates,
): DayTotals {
  let flightsBilled = 0, ppCount = 0, ccCount = 0, cCount = 0;
  let thermalCount = 0, noShowCount = 0, tipChf = 0;

  for (const f of flights) {
    tipChf += Number(f.tip_chf ?? 0);
    if (f.is_no_show) { noShowCount++; continue; }
    flightsBilled++;
    if (f.photo_status === 'PP') ppCount++;
    else if (f.photo_status === 'CC') ccCount++;
    else if (f.photo_status === 'C') cCount++;
    if (f.is_double_airtime) thermalCount++;
  }

  const flightsChf = flightsBilled * rates.flight_rate_chf;
  const ppChf = ppCount * rates.photo_prepaid_rate_chf;
  const ccChf = ccCount * rates.photo_prepaid_rate_chf;
  const cChf = cCount * rates.photo_prepaid_rate_chf;
  const thermalChf = thermalCount * rates.thermal_rate_chf;
  const noShowChf = noShowCount * rates.no_show_rate_chf;
  const totalChf = flightsChf + ppChf + thermalChf + noShowChf;
  const personalTotalChf = totalChf + ccChf + cChf;

  return {
    flightsBilled, ppCount, ccCount, cCount, thermalCount, noShowCount, tipChf,
    flightsChf, ppChf, ccChf, cChf, thermalChf, noShowChf,
    totalChf,
    personalTotalChf,
    totalWithTipsChf: personalTotalChf + tipChf,
  };
}
