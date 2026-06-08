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
    .select('full_name, google_refresh_token, einsatzplan_synced_at, einsatzplan_last_file_name, season_override')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot) redirect('/onboarding');

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div>
        <p className="text-text-muted text-xs">
          {pilot.einsatzplan_synced_at && (
            <>Letzter Import: {formatDateDe(pilot.einsatzplan_synced_at, {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}{pilot.einsatzplan_last_file_name && ` · ${pilot.einsatzplan_last_file_name}`}</>
          )}
        </p>
        <h1 className="text-2xl font-display font-bold">Einsatzplan importieren</h1>
        <p className="text-text-muted text-sm mt-1">
          Drive-Link einfügen, Vorschau prüfen, korrigieren, speichern.
          Bestehende Daten anderer Monate bleiben erhalten.
        </p>
      </div>

      {!pilot.google_refresh_token ? (
        <div className="card p-4 border-l-4 border-l-warning">
          <p className="text-sm">Google Drive ist noch nicht verbunden.</p>
          <Link href="/settings" className="btn-primary inline-flex mt-2">
            Zu den Einstellungen
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
