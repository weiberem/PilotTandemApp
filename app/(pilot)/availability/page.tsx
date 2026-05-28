import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';
import { addMonths, monthFirst, type AvailabilityDay } from '@/lib/availability';

export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase
    .from('pilots')
    .select('full_name, office_email, season_override')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot) redirect('/settings?welcome=1');

  // Load current + next month submissions so navigating doesn't refetch.
  const now = new Date();
  const cur = { year: now.getFullYear(), monthIndex0: now.getMonth() };
  const next = addMonths(cur.year, cur.monthIndex0, 1);
  const months = [monthFirst(cur.year, cur.monthIndex0), monthFirst(next.year, next.monthIndex0)];

  const { data: subs } = await supabase
    .from('availability_submissions')
    .select('month, days')
    .in('month', months);

  const initialDaysByMonth: Record<string, AvailabilityDay[]> = {};
  for (const m of months) initialDaysByMonth[m] = [];
  for (const s of subs ?? []) {
    initialDaysByMonth[s.month as string] = (s.days as AvailabilityDay[]) ?? [];
  }

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-display font-bold">Verfügbarkeit</h1>
      <AvailabilityCalendar
        pilotName={pilot.full_name ?? ''}
        officeEmail={pilot.office_email ?? null}
        seasonOverride={pilot.season_override ?? null}
        initialMonth={cur}
        initialDaysByMonth={initialDaysByMonth}
      />
    </div>
  );
}
