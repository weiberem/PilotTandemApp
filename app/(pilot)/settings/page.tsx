import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';
import { GoogleDriveConnect } from '@/components/GoogleDriveConnect';
import { BackupButton } from '@/components/BackupButton';
import { SetupStatusCard } from '@/components/SetupStatusCard';
import { LogoutButton } from '@/components/LogoutButton';
import { LocalBackupCard } from '@/components/LocalBackupCard';
import { PilotCompaniesCard } from '@/components/PilotCompaniesCard';
import { listPilotCompanies } from '@/lib/pilotCompanies';
import { probeMissingMigrations } from '@/lib/setupProbe';

export const dynamic = 'force-dynamic';

const GDRIVE_MESSAGES: Record<string, { kind: 'ok' | 'warn' | 'err'; text: string }> = {
  connected: { kind: 'ok', text: 'Google Drive connected.' },
  state_mismatch: { kind: 'err', text: 'OAuth state mismatch — please try again.' },
  no_refresh: { kind: 'warn', text: 'No refresh token received. Revoke in your Google account and connect again.' },
  error: { kind: 'err', text: 'Connection failed.' },
};

export default async function SettingsPage({
  searchParams,
}: { searchParams: { welcome?: string; gdrive?: string; msg?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase.from('pilots').select('*').eq('id', user.id).maybeSingle();
  const gdriveMsg = searchParams.gdrive ? GDRIVE_MESSAGES[searchParams.gdrive] : null;
  const missingMigrations = await probeMissingMigrations(user.id);
  const otherCompanies = await listPilotCompanies(supabase, user.id);

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      {searchParams.welcome && (
        <div className="card p-4 border-l-4 border-l-accent">
          <h2 className="font-display font-semibold">Welcome to TandemLog!</h2>
          <p className="text-sm text-text-muted">
            Please complete your profile first. Required fields: name and IBAN.
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

      <h1 className="text-2xl font-display font-bold">Settings</h1>
      <SetupStatusCard missing={missingMigrations} />
      <SettingsForm
        pilot={pilot}
        email={user.email ?? ''}
        driveConnect={
          <GoogleDriveConnect
            connected={!!pilot?.google_refresh_token}
            lastSyncedAt={pilot?.einsatzplan_synced_at ?? null}
            hasFileId={!!pilot?.einsatzplan_file_id}
          />
        }
        driveBackup={
          pilot?.google_refresh_token && pilot?.google_drive_folder_id
            ? <BackupButton />
            : null
        }
      />

      <fieldset className="card p-4 space-y-3">
        <legend className="px-2 -ml-2 text-sm font-display font-semibold text-text-muted uppercase tracking-wide">
          Other companies
        </legend>
        <PilotCompaniesCard
          initial={otherCompanies}
          primaryRates={{
            flight_rate_chf: Number(pilot?.flight_rate_chf ?? 105),
            photo_prepaid_rate_chf: Number(pilot?.photo_prepaid_rate_chf ?? 40),
            thermal_rate_chf: Number(pilot?.thermal_rate_chf ?? 50),
            no_show_rate_chf: Number(pilot?.no_show_rate_chf ?? 32),
          }}
        />
      </fieldset>

      <fieldset className="card p-4 space-y-3">
        <legend className="px-2 -ml-2 text-sm font-display font-semibold text-text-muted uppercase tracking-wide">
          Local backup
        </legend>
        <LocalBackupCard />
      </fieldset>

      <fieldset className="card p-4 space-y-3">
        <legend className="px-2 -ml-2 text-sm font-display font-semibold text-text-muted uppercase tracking-wide">
          Account
        </legend>
        <p className="text-sm text-text-muted">
          Signed in as <span className="font-mono">{user.email}</span>
        </p>
        <LogoutButton />
      </fieldset>
    </div>
  );
}
