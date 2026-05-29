import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AvailabilityCalendar, type ScheduleMap } from '@/components/AvailabilityCalendar';
import { PlanManager } from '@/components/PlanManager';
import { addMonths, monthFirst, type AvailabilityDay } from '@/lib/availability';
import type { FullPlan } from '@/lib/einsatzplanParser';

export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Base query: only columns guaranteed to exist after migration 001/002.
  const { data: pilot } = await supabase
    .from('pilots')
    .select('full_name, office_email, season_override, einsatzplan_schedule')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot) redirect('/settings?welcome=1');

  // Optional column from migration 004 — fetched separately so the page
  // still works if that migration hasn't been applied yet.
  let fullPlan: FullPlan | null = null;
  const { data: fullRow } = await supabase
    .from('pilots')
    .select('einsatzplan_full_plan')
    .eq('id', user.id)
    .maybeSingle();
  if (fullRow && 'einsatzplan_full_plan' in fullRow) {
    fullPlan = (fullRow.einsatzplan_full_plan as FullPlan | null) ?? null;
  }

  const now = new Date();
  const cur = { year: now.getFullYear(), monthIndex0: now.getMonth() };
  const next = addMonths(cur.year, cur.monthIndex0, 1);
  const months = [monthFirst(cur.year, cur.monthIndex0), monthFirst(next.year, next.monthIndex0)];

  const { data: subs } = await supabase
    .from('availability_submissions')
    .select('month, days, submitted_at, email_sent')
    .in('month', months);

  const initialDaysByMonth: Record<string, AvailabilityDay[]> = {};
  const submittedByMonth: Record<string, boolean> = {};
  for (const m of months) { initialDaysByMonth[m] = []; submittedByMonth[m] = false; }
  for (const s of subs ?? []) {
    const key = s.month as string;
    initialDaysByMonth[key] = (s.days as AvailabilityDay[]) ?? [];
    submittedByMonth[key] = !!(s.submitted_at || s.email_sent);
  }

  const schedule = (pilot.einsatzplan_schedule as ScheduleMap | null) ?? {};

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-display font-bold">Verfügbarkeit</h1>
      <AvailabilityCalendar
        pilotName={pilot.full_name ?? ''}
        officeEmail={pilot.office_email ?? null}
        seasonOverride={pilot.season_override ?? null}
        initialMonth={cur}
        initialDaysByMonth={initialDaysByMonth}
        submittedByMonth={submittedByMonth}
        schedule={schedule}
        fullPlan={fullPlan}
      />
      <PlanManager />
    </div>
  );
}
