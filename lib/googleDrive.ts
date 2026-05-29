/**
 * Minimal Google OAuth + Drive helpers — no @googleapis/* dependency.
 * Uses Google's REST endpoints directly with fetch.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI  (must match the value in the Google Cloud Console)
 *
 * Scope: drive.file — gives access only to files the app creates or that the
 * user explicitly opens via picker. Combined with drive.readonly for
 * reading the Einsatzplan file the user pasted by ID.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export type GoogleEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getGoogleEnv(): GoogleEnv {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).');
  }
  return { clientId, clientSecret, redirectUri };
}

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  // Calendar: create/update the app's own events in the pilot's calendar
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

export function buildAuthUrl(state: string): string {
  const env = getGoogleEnv();
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const env = getGoogleEnv();
  const body = new URLSearchParams({
    code,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: env.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const env = getGoogleEnv();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Pull a Drive file ID out of a URL the user pasted. Handles:
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0
 *   https://drive.google.com/open?id=<ID>
 *   bare file IDs (33+ chars, alphanumeric + -_)
 */
export function extractDriveFileId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const patterns: RegExp[] = [
    /\/d\/([a-zA-Z0-9_-]{20,})/,
    /[?&]id=([a-zA-Z0-9_-]{20,})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  // Bare ID — no slash, no scheme
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

export async function getFileMetadata(fileId: string, accessToken: string): Promise<DriveFileEntry> {
  const url = `${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive metadata failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function downloadDriveFile(fileId: string, accessToken: string): Promise<ArrayBuffer> {
  const url = `${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status} ${await res.text()}`);
  return res.arrayBuffer();
}

export type DriveFileEntry = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;   // ISO
};

/**
 * List Excel-like files inside a folder, newest modifiedTime first.
 * Used to auto-pick the latest Einsatzplan when Skywings drops a new file
 * each month into a shared folder.
 *
 * Matches both modern .xlsx and legacy .xls, plus Google Sheets (which export
 * as XLSX via /export endpoint — caller handles that distinction).
 */
export async function listExcelFilesInFolder(
  folderId: string,
  accessToken: string,
): Promise<DriveFileEntry[]> {
  // Drive v3 query: parents = folderId, not trashed, spreadsheet-like mime types
  const q = [
    `'${folderId.replace(/'/g, "\\'")}' in parents`,
    `trashed = false`,
    `(mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'`,
    ` or mimeType = 'application/vnd.ms-excel'`,
    ` or mimeType = 'application/vnd.google-apps.spreadsheet')`,
  ].join(' and ');
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '20',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  const res = await fetch(`${DRIVE_FILES}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive list failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { files?: DriveFileEntry[] };
  return data.files ?? [];
}

/**
 * Google Sheets aren't downloadable as binary — export them as XLSX instead.
 */
export async function exportSheetAsXlsx(fileId: string, accessToken: string): Promise<ArrayBuffer> {
  const url = `${DRIVE_FILES}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive export failed: ${res.status} ${await res.text()}`);
  return res.arrayBuffer();
}

/**
 * Convenience: given a file entry, fetch its XLSX bytes — using export for
 * Google Sheets and direct download for native .xlsx/.xls.
 */
export async function fetchExcelBytes(file: DriveFileEntry, accessToken: string): Promise<ArrayBuffer> {
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    return exportSheetAsXlsx(file.id, accessToken);
  }
  return downloadDriveFile(file.id, accessToken);
}

/**
 * Find a sub-folder by exact name inside a parent folder, or create it.
 * Returns the folder ID.
 */
export async function findOrCreateFolder(
  parentId: string,
  name: string,
  accessToken: string,
): Promise<string> {
  const escName = name.replace(/'/g, "\\'");
  const q = [
    `'${parentId.replace(/'/g, "\\'")}' in parents`,
    `name = '${escName}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(' and ');
  const params = new URLSearchParams({
    q, fields: 'files(id,name)', pageSize: '5',
    supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
  });
  const lookup = await fetch(`${DRIVE_FILES}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!lookup.ok) throw new Error(`folder lookup failed: ${lookup.status} ${await lookup.text()}`);
  const data = await lookup.json() as { files?: { id: string }[] };
  if (data.files && data.files.length > 0) return data.files[0].id;

  const create = await fetch(`${DRIVE_FILES}?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      parents: [parentId],
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!create.ok) throw new Error(`folder create failed: ${create.status} ${await create.text()}`);
  const created = await create.json() as { id: string };
  return created.id;
}

/**
 * Resolve (and create) a nested path: parentId -> "2025" -> "01" -> id
 */
export async function findOrCreatePath(
  parentId: string,
  segments: string[],
  accessToken: string,
): Promise<string> {
  let current = parentId;
  for (const seg of segments) {
    current = await findOrCreateFolder(current, seg, accessToken);
  }
  return current;
}

/**
 * List files matching a name prefix inside a folder.
 */
export async function listFilesByNamePrefix(
  parentId: string,
  prefix: string,
  accessToken: string,
): Promise<DriveFileEntry[]> {
  const q = [
    `'${parentId.replace(/'/g, "\\'")}' in parents`,
    `name contains '${prefix.replace(/'/g, "\\'")}'`,
    `trashed = false`,
  ].join(' and ');
  const params = new URLSearchParams({
    q, fields: 'files(id,name,mimeType,modifiedTime)',
    orderBy: 'modifiedTime desc', pageSize: '100',
    supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
  });
  const res = await fetch(`${DRIVE_FILES}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { files?: DriveFileEntry[] };
  return data.files ?? [];
}

export async function deleteDriveFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete failed: ${res.status} ${await res.text()}`);
  }
}

export async function uploadToDriveFolder({
  accessToken, folderId, name, mimeType, body,
}: {
  accessToken: string;
  folderId: string;
  name: string;
  mimeType: string;
  body: ArrayBuffer;
}): Promise<{ id: string; webViewLink?: string }> {
  // Multipart upload: metadata + media.
  const boundary = '----TandemLog' + Math.random().toString(36).slice(2);
  const metadata = { name, parents: [folderId], mimeType };
  const enc = new TextEncoder();
  const parts: BlobPart[] = [
    enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    enc.encode(JSON.stringify(metadata)),
    enc.encode(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    body,
    enc.encode(`\r\n--${boundary}--`),
  ];
  const blob = new Blob(parts);
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: blob,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}
