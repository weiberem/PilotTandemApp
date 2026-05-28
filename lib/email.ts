import { Resend } from 'resend';

let _client: Resend | null = null;

export function getResend(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not configured');
  _client = new Resend(key);
  return _client;
}

export function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'TandemLog <onboarding@resend.dev>';
}
