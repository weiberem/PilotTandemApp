import type { SupabaseClient } from '@supabase/supabase-js';

export type SeasonSetting = 'auto' | 'summer' | 'winter';

/**
 * The office-controlled current season from app_settings (singleton row).
 * Returns 'auto' when unset or when the table doesn't exist yet (pre-migration),
 * so callers safely fall back to date-based detection.
 */
export async function getAdminSeason(sb: SupabaseClient): Promise<SeasonSetting> {
  try {
    const { data } = await sb.from('app_settings').select('current_season').eq('id', 1).maybeSingle();
    const v = (data as { current_season?: string } | null)?.current_season;
    return v === 'summer' || v === 'winter' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
