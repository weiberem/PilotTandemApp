import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AvailabilityCalendar, type ScheduleMap, type FullPlansByMonth } from '@/components/AvailabilityCalendar';
import { PlanManager } from '@/components/PlanManager';
import { addMonths, monthFirst, type AvailabilityDay } from '@/lib/availability';
import type { EinsatzplanImports } from '@/lib/einsatzplanImports';
import type { FullPlan } from '@/lib/einsatzplanParser';

export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase
    .from('pilots')
    .select('full_name, office_email, season_override, einsatzplan_schedule')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot) redirect('/onboarding');

  // Optional columns (migrations 004 + 005). Pulled separately so the page
  // still works if either migration hasn't been applied yet.
  let legacyFullPlan: FullPlan | null = null;
  let imports: EinsatzplanImports = {};
  const { data: extra } = await supabase
    .from('pilots')
    .select('einsatzplan_full_plan, einsatzplan_imports')
    .eq('id', user.id)
    .maybeSingle();
  if (extra) {
    if ('einsatzplan_full_plan' in extra) {
      legacyFullPlan = (extra.einsatzplan_full_plan as FullPlan | null) ?? null;
    }
    if ('einsatzplan_imports' in extra) {
      imports = (extra.einsatzplan_imports as EinsatzplanImports | null) ?? {};
    }
  }

  // Build a YYYY-MM -> FullPlan map from the per-month slots, falling back
  // to the legacy active full_plan for whichever month it covers.
  const fullPlansByMonth: FullPlansByMonth = {};
  for (const [key, slot] of Object.entries(imports)) {
    if (slot.full_plan) fullPlansByMonth[key] = slot.full_plan;
  }
  if (legacyFullPlan?.month) {
    const k = legacyFullPlan.month.slice(0, 7);
    if (!fullPlansByMonth[k]) fullPlansByMonth[k] = legacyFullPlan;
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

  // Same map idea for the per-pilot schedule (used to dot the calendar with
  // "Skywings geplant" rings). Per-month imports take precedence; the legacy
  // active column covers anything not in a slot yet.
  const schedule: ScheduleMap = (pilot.einsatzplan_schedule as ScheduleMap | null) ?? {};
  for (const slot of Object.values(imports)) {
    for (const [date, entry] of Object.entries(slot.schedule ?? {})) {
      schedule[date] = entry;
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-display font-bold">Plan working days</h1>
      <AvailabilityCalendar
        pilotName={pilot.full_name ?? ''}
        officeEmail={pilot.office_email ?? null}
        seasonOverride={pilot.season_override ?? null}
        initialMonth={cur}
        initialDaysByMonth={initialDaysByMonth}
        submittedByMonth={submittedByMonth}
        schedule={schedule}
        fullPlansByMonth={fullPlansByMonth}
      />
      <PlanManager />
    </div>
  );
}
