import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Hard email allowlist for the admin area. Even a row in the `admins` table
 * is NOT enough — the signed-in account's email must be on this list. Set
 * ADMIN_EMAILS (comma-separated) to extend; defaults to the owner only.
 */
const DEFAULT_ADMIN_EMAILS = ['remy.weibel@gmail.com'];

export function allowedAdminEmails(): string[] {
  const env = process.env.ADMIN_EMAILS;
  const list = env ? env.split(',') : DEFAULT_ADMIN_EMAILS;
  return list.map(e => e.trim().toLowerCase()).filter(Boolean);
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedAdminEmails().includes(email.trim().toLowerCase());
}

/**
 * Returns the authenticated user only if BOTH conditions hold:
 *  1. their email is on the hard allowlist, AND
 *  2. they have a row in the `admins` table.
 * Otherwise null. Use in every admin API route + the admin layout.
 */
export async function requireAdmin(sb: SupabaseClient) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  if (!isAllowedAdminEmail(user.email)) return null;
  const { data } = await sb.from('admins').select('id').eq('id', user.id).maybeSingle();
  return data ? user : null;
}
