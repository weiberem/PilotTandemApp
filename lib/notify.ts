import { getResend, getFromAddress } from '@/lib/email';

// Owner contact for access-request pings. Override via env in production.
const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP_PHONE ?? '+41791242174';
const OWNER_EMAIL = process.env.OWNER_NOTIFY_EMAIL ?? 'remy.weibel@gmail.com';

/**
 * Notify the app owner that someone wants to connect Google Drive and needs to
 * be whitelisted as a test user in the Google Cloud Console. Best-effort:
 * tries WhatsApp (CallMeBot) and email in parallel and never throws, so it
 * can't block the OAuth redirect.
 */
export async function notifyDriveAccessRequest(requesterEmail: string): Promise<void> {
  const text = `🪂 TandemLog: ${requesterEmail} möchte Google Drive verbinden und muss als Test-User in der Google Cloud Console freigeschaltet werden.`;
  await Promise.allSettled([sendWhatsApp(text), sendEmail(requesterEmail, text)]);
}

/**
 * Send a WhatsApp to the owner via CallMeBot. Requires CALLMEBOT_API_KEY (the
 * owner obtains it once by messaging the CallMeBot WhatsApp bot from
 * OWNER_WHATSAPP). No key → silently skipped (email still goes out).
 */
async function sendWhatsApp(text: string): Promise<void> {
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!apiKey || !OWNER_WHATSAPP) return;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(OWNER_WHATSAPP)}`
    + `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apiKey)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(url, { signal: ctrl.signal });
  } catch {
    /* best effort */
  } finally {
    clearTimeout(t);
  }
}

async function sendEmail(requesterEmail: string, text: string): Promise<void> {
  if (!process.env.RESEND_API_KEY || !OWNER_EMAIL) return;
  try {
    await getResend().emails.send({
      from: getFromAddress(),
      to: OWNER_EMAIL,
      subject: `Drive-Zugang freischalten: ${requesterEmail}`,
      text: `${text}\n\nFreischalten: Google Cloud Console → APIs & Dienste → `
        + `OAuth-Zustimmungsbildschirm → Test-User → Nutzer hinzufügen → ${requesterEmail}`,
    });
  } catch {
    /* best effort */
  }
}
