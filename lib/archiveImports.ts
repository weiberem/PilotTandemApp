import { createServiceClient } from './supabase/server';
import type { EinsatzplanImports } from './einsatzplanImports';

/**
 * Mark every imports[month] with month < previousMonthKey as archived.
 * Run from the monthly cron on the 1st so that "the month that just ended"
 * (and anything older that may still be unflagged) gets locked.
 *
 * Returns the count of newly archived months per pilot.
 */
export async function archivePreviousMonthImports(
  previousMonthKey: string,   // "YYYY-MM"
): Promise<Array<{ pilot_id: string; archived: number }>> {
  const svc = createServiceClient();
  const { data: pilots, error } = await svc
    .from('pilots')
    .select('id, einsatzplan_imports')
    .eq('is_active', true);
  if (error) throw error;

  const summary: Array<{ pilot_id: string; archived: number }> = [];
  for (const p of pilots ?? []) {
    const imports = (p.einsatzplan_imports as EinsatzplanImports | null) ?? {};
    let changed = 0;
    for (const [key, entry] of Object.entries(imports)) {
      if (key <= previousMonthKey && !entry.archived) {
        entry.archived = true;
        changed++;
      }
    }
    if (changed > 0) {
      await svc.from('pilots').update({ einsatzplan_imports: imports }).eq('id', p.id);
    }
    summary.push({ pilot_id: p.id, archived: changed });
  }
  return summary;
}
