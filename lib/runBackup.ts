import { createServiceClient } from './supabase/server';
import { generateMonthlyBackupXlsx } from './backupXlsx';
import {
  deleteDriveFile, listFilesByNamePrefix, refreshAccessToken, uploadToDriveFolder,
} from './googleDrive';
import type { FlightRow } from './flights';

const BACKUP_PREFIX = 'Fluege_';
const KEEP_MONTHS = 2;

export type RunBackupResult =
  | { ok: true; file_id: string; file_name: string; deleted: string[] }
  | { ok: false; error: string; skipped?: 'no_drive' | 'no_flights' };

/**
 * Generate a monthly backup XLSX in the pilot's hand-maintained layout,
 * upload it into the root Drive folder, and prune backups older than KEEP_MONTHS.
 *
 * @param pilotId - which pilot to run for (uses service-role client because
 *                  this is invoked from cron + user-initiated routes)
 * @param monthFirst - YYYY-MM-01 of the month to back up
 */
export async function runMonthlyBackup(
  pilotId: string,
  monthFirst: string,
): Promise<RunBackupResult> {
  const svc = createServiceClient();

  const { data: pilot, error: perr } = await svc
    .from('pilots')
    .select('full_name, google_refresh_token, google_drive_folder_id')
    .eq('id', pilotId)
    .maybeSingle();
  if (perr) return { ok: false, error: perr.message };
  if (!pilot) return { ok: false, error: 'pilot_not_found' };
  if (!pilot.google_refresh_token || !pilot.google_drive_folder_id) {
    return { ok: false, error: 'drive_not_configured', skipped: 'no_drive' };
  }

  const [y, m] = monthFirst.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthLast = `${monthFirst.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;

  const { data: flightRows, error: ferr } = await svc
    .from('flights').select('*')
    .eq('pilot_id', pilotId)
    .gte('flight_date', monthFirst).lte('flight_date', monthLast)
    .order('flight_date').order('trip_time');
  if (ferr) return { ok: false, error: ferr.message };
  const flights = (flightRows ?? []) as FlightRow[];
  if (flights.length === 0) return { ok: false, error: 'no_flights', skipped: 'no_flights' };

  const tokens = await refreshAccessToken(pilot.google_refresh_token);
  const buf = await generateMonthlyBackupXlsx({
    flights, monthFirst, pilotName: pilot.full_name ?? '',
  });

  const fileName = `${BACKUP_PREFIX}${monthFirst.slice(0, 7).replace('-', '_')}.xlsx`;

  // If a backup with this exact name exists, delete first (upload would create a duplicate).
  const existing = await listFilesByNamePrefix(
    pilot.google_drive_folder_id, fileName, tokens.access_token,
  );
  for (const f of existing) {
    if (f.name === fileName) {
      await deleteDriveFile(f.id, tokens.access_token).catch(() => {});
    }
  }

  const up = await uploadToDriveFolder({
    accessToken: tokens.access_token,
    folderId: pilot.google_drive_folder_id,
    name: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  });

  // Cleanup: keep only the last KEEP_MONTHS backups (by YYYY_MM in filename).
  const allBackups = await listFilesByNamePrefix(
    pilot.google_drive_folder_id, BACKUP_PREFIX, tokens.access_token,
  );
  const monthly = allBackups
    .map(f => {
      const m2 = f.name.match(/^Fluege_(\d{4})_(\d{2})\.xlsx$/);
      return m2 ? { id: f.id, name: f.name, key: `${m2[1]}-${m2[2]}` } : null;
    })
    .filter((x): x is { id: string; name: string; key: string } => !!x)
    .sort((a, b) => b.key.localeCompare(a.key)); // newest first

  const deleted: string[] = [];
  for (const old of monthly.slice(KEEP_MONTHS)) {
    try {
      await deleteDriveFile(old.id, tokens.access_token);
      deleted.push(old.name);
    } catch { /* swallow */ }
  }

  return { ok: true, file_id: up.id, file_name: fileName, deleted };
}
