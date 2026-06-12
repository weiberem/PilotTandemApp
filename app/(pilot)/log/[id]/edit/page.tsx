import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FlightForm } from '@/components/FlightForm';
import { listPilotCompanies } from '@/lib/pilotCompanies';
import { DeleteFlightButton } from '@/components/DeleteFlightButton';
import { formatDateDe } from '@/lib/utils';
import { getCurrentTripTimes, resolveSeason, type Season } from '@/lib/tripTimes';
import type { FlightInput, FlightRow } from '@/lib/flights';

export const dynamic = 'force-dynamic';

export default async function EditFlightPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: pilot }, { data: flight }] = await Promise.all([
    supabase.from('pilots').select('primary_company_name, season_override, einsatzplan_schedule').eq('id', user.id).maybeSingle(),
    supabase.from('flights').select('*').eq('id', params.id).maybeSingle(),
  ]);

  if (!flight) notFound();
  const row = flight as FlightRow;

  const season: Season = resolveSeason(pilot?.season_override ?? null, new Date(row.flight_date));
  const seasonTimes = getCurrentTripTimes(season);
  const scheduleEntry = (pilot?.einsatzplan_schedule as Record<string, { times?: string[] }> | null)?.[row.flight_date];
  const scheduledTimes = scheduleEntry?.times ?? [...seasonTimes];

  const defaults: FlightInput = {
    flight_date: row.flight_date,
    trip_time: row.trip_time,
    company: row.company,
    photo_status: row.photo_status,
    is_no_show: row.is_no_show,
    is_double_airtime: row.is_double_airtime,
    tip_chf: Number(row.tip_chf ?? 0),
    notes: row.notes ?? null,
  };

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-muted text-sm">{formatDateDe(new Date(row.flight_date))}</p>
          <h1 className="text-2xl font-display font-bold">Edit Flight</h1>
        </div>
        <Link href="/today" className="text-sm text-text-muted">Cancel</Link>
      </div>

      <FlightForm
        mode="edit"
        flight={row}
        defaults={defaults}
        seasonOverride={pilot?.season_override ?? null}
        primaryCompany={pilot?.primary_company_name ?? 'Skywings'}
        scheduledTimes={scheduledTimes}
        otherCompanies={await listPilotCompanies(supabase, user.id)}
      />

      <div className="pt-4 border-t border-border">
        <DeleteFlightButton id={row.id} />
      </div>
    </div>
  );
}
