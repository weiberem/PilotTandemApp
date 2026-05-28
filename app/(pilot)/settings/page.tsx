import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';
import { GoogleDriveConnect } from '@/components/GoogleDriveConnect';
import { BackupButton } from '@/components/BackupButton';

export const dynamic = 'force-dynamic';

const GDRIVE_MESSAGES: Record<string, { kind: 'ok' | 'warn' | 'err'; text: string }> = {
  connected: { kind: 'ok', text: 'Google Drive verbunden.' },
  state_mismatch: { kind: 'err', text: 'OAuth State stimmt nicht — bitte erneut versuchen.' },
  no_refresh: { kind: 'warn', text: 'Kein Refresh-Token erhalten. Widerruf in Google-Konto und nochmals verbinden.' },
  error: { kind: 'err', text: 'Verbindung fehlgeschlagen.' },
};

export default async function SettingsPage({
  searchParams,
}: { searchParams: { welcome?: string; gdrive?: string; msg?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase.from('pilots').select('*').eq('id', user.id).maybeSingle();
  const gdriveMsg = searchParams.gdrive ? GDRIVE_MESSAGES[searchParams.gdrive] : null;

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      {searchParams.welcome && (
        <div className="card p-4 border-l-4 border-l-accent">
          <h2 className="font-display font-semibold">Willkommen bei TandemLog!</h2>
          <p className="text-sm text-text-muted">
            Bitte vervollständige zuerst dein Profil. Pflichtfelder: Name und IBAN.
          </p>
        </div>
      )}
      {gdriveMsg && (
        <div className={`card p-3 border-l-4 ${
          gdriveMsg.kind === 'ok' ? 'border-l-success'
          : gdriveMsg.kind === 'warn' ? 'border-l-warning'
          : 'border-l-danger'
        } text-sm`}>
          {gdriveMsg.text}{searchParams.msg ? ` (${decodeURIComponent(searchParams.msg)})` : ''}
        </div>
      )}

      <h1 className="text-2xl font-display font-bold">Einstellungen</h1>
      <SettingsForm pilot={pilot} email={user.email ?? ''} />

      <fieldset className="card p-4 space-y-3">
        <legend className="px-2 -ml-2 text-sm font-display font-semibold text-text-muted uppercase tracking-wide">
          Google Drive Verbindung
        </legend>
        <GoogleDriveConnect
          connected={!!pilot?.google_refresh_token}
          lastSyncedAt={pilot?.einsatzplan_synced_at ?? null}
          hasFileId={!!pilot?.einsatzplan_file_id}
        />
      </fieldset>

      {pilot?.google_refresh_token && pilot?.google_drive_folder_id && (
        <fieldset className="card p-4 space-y-3">
          <legend className="px-2 -ml-2 text-sm font-display font-semibold text-text-muted uppercase tracking-wide">
            Monatliches Excel-Backup
          </legend>
          <BackupButton />
        </fieldset>
      )}
    </div>
  );
}
