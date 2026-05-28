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

export async function downloadDriveFile(fileId: string, accessToken: string): Promise<ArrayBuffer> {
  const url = `${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status} ${await res.text()}`);
  return res.arrayBuffer();
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
