import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EinsatzplanImporter } from './EinsatzplanImporter';
import { CalendarPushButton } from '@/components/CalendarPushButton';
import { formatDateDe } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function EinsatzplanPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase
    .from('pilots')
    .select('full_name, google_refresh_token, einsatzplan_synced_at, einsatzplan_last_file_name, season_override, google_enabled, pilot_type')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot) redirect('/onboarding');
  // Independent pilots have no Skywings schedule import.
  if ((pilot as { pilot_type?: string }).pilot_type === 'independent') redirect('/home');
  // Google integration switched off for this pilot → nothing to do here.
  if (!(pilot.google_enabled ?? true)) redirect('/home');

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div>
        <p className="text-text-muted text-xs">
          {pilot.einsatzplan_synced_at && (
            <>Last import: {formatDateDe(pilot.einsatzplan_synced_at, {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}{pilot.einsatzplan_last_file_name && ` · ${pilot.einsatzplan_last_file_name}`}</>
          )}
        </p>
        <h1 className="text-2xl font-display font-bold">Import Schedule</h1>
        <p className="text-text-muted text-sm mt-1">
          Paste the Drive link, review the preview, correct, save.
          Existing data for other months is preserved.
        </p>
      </div>

      {!pilot.google_refresh_token ? (
        <div className="card p-4 border-l-4 border-l-warning">
          <p className="text-sm">Google Drive is not yet connected.</p>
          <Link href="/settings" className="btn-primary inline-flex mt-2">
            Go to Settings
          </Link>
        </div>
      ) : (
        <>
          <EinsatzplanImporter seasonOverride={pilot.season_override ?? null} />
          {pilot.einsatzplan_synced_at && <CalendarPushButton />}
        </>
      )}
    </div>
  );
}
