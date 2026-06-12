import type { SupabaseClient } from '@supabase/supabase-js';

export type PilotCompany = {
  id: string;
  name: string;
  address: string | null;
  flight_rate_chf: number | null;
  photo_prepaid_rate_chf: number | null;
  thermal_rate_chf: number | null;
  no_show_rate_chf: number | null;
  trip_times: string[] | null;
  trip_times_winter: string[] | null;
  color_hex: string;
  office_email: string | null;
  is_active: boolean;
  display_order: number;
};

/**
 * Default color palette for company tints. Skywings keeps the amber brand
 * (matches the existing backup XLSX legend); the rest are spread for
 * visual separation in flight lists.
 */
export const COMPANY_COLORS: Record<string, string> = {
  skywings: '#E08A0B',
  alpinair: '#F4B400',
  twin: '#3D6CB3',
  swiss: '#3FA796',
};

export function suggestColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('skyw')) return COMPANY_COLORS.skywings;
  if (n.includes('alpin')) return COMPANY_COLORS.alpinair;
  if (n.includes('twin')) return COMPANY_COLORS.twin;
  if (n.includes('swiss') || n.includes('-paragliding')) return COMPANY_COLORS.swiss;
  return '#7B6D8D';
}

/** Pick the right schedule for the active season. Winter falls back to summer. */
export function companyTimesForSeason(
  c: Pick<PilotCompany, 'trip_times' | 'trip_times_winter'>,
  season: 'summer' | 'winter',
): string[] | null {
  if (season === 'winter' && c.trip_times_winter && c.trip_times_winter.length > 0) {
    return c.trip_times_winter;
  }
  return c.trip_times && c.trip_times.length > 0 ? c.trip_times : null;
}

/**
 * Built-in suggestions shown on the "Add company" form. The pilot picks one
 * (or types their own) and rates default to the pilot's primary rates.
 */
export const COMPANY_SUGGESTIONS: Array<{ name: string; address: string }> = [
  { name: 'AlpinAir Paragliding GmbH',  address: 'Mettlenweg 8, 3706 Leissigen' },
  { name: 'Twin Paragliding GmbH',      address: 'Hauptstrasse 36, 3800 Matten bei Interlaken' },
  { name: 'Swiss-Paragliding.ch',       address: 'Hobacher 98a, 3814 Gsteigwiler' },
];

/** Fetch the pilot's extra companies (RLS-scoped to caller). */
export async function listPilotCompanies(sb: SupabaseClient, pilotId: string): Promise<PilotCompany[]> {
  const { data } = await sb
    .from('pilot_companies')
    .select('id, name, address, flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf, trip_times, trip_times_winter, color_hex, office_email, is_active, display_order')
    .eq('pilot_id', pilotId)
    .order('display_order')
    .order('name');
  return (data ?? []) as PilotCompany[];
}
