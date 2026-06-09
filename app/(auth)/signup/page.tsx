'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void; theme?: string }) => string;
      reset: (id?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

export default function SignupPage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!siteKey || done) return;
    function render() {
      if (!widgetRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey!,
        callback: (token: string) => setCaptchaToken(token),
        'error-callback': () => setCaptchaToken(null),
      });
    }
    if (window.turnstile) {
      render();
    } else {
      window.onTurnstileLoad = render;
    }
  }, [siteKey, done]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!captchaToken) {
      setError('Please complete the captcha.');
      return;
    }
    startTransition(async () => {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, password, full_name: fullName,
          invite_code: inviteCode,
          captcha_token: captchaToken,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        const map: Record<string, string> = {
          invalid_invite_code: 'Wrong invite code — ask the team for the current one.',
          captcha_failed: 'Captcha verification failed. Please try again.',
          email_already_registered: 'That email is already registered. Sign in instead.',
          signup_not_configured: 'Signup is temporarily disabled. Please contact the admin.',
          missing_fields: 'Please fill in all fields.',
        };
        setError(map[data.error] ?? data.error ?? 'Signup failed');
        window.turnstile?.reset(widgetIdRef.current ?? undefined);
        setCaptchaToken(null);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-display font-semibold mb-2">Check your inbox</h1>
        <p className="text-sm text-text-muted mb-4">
          We sent a confirmation link to <span className="font-mono">{email}</span>. Click it to
          activate your account, then sign in with the password you just set.
        </p>
        <Link href="/login" className="btn-ghost w-full">Back to Sign In</Link>
      </div>
    );
  }

  return (
    <>
      {siteKey && (
        // Cloudflare Turnstile loader. Renders an invisible-friendly widget.
        // eslint-disable-next-line @next/next/no-sync-scripts
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad" defer />
      )}
      <div className="card p-6">
        <h1 className="text-xl font-display font-semibold mb-4">Create account</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Invite code</span>
            <input
              type="text" required value={inviteCode} onChange={e => setInviteCode(e.target.value)}
              className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono"
              placeholder="From the team chat"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Full name</span>
            <input
              type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
              className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
              autoComplete="name"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password" required minLength={8} value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
              autoComplete="new-password"
            />
            <span className="text-xs text-text-muted">At least 8 characters.</span>
          </label>

          {siteKey ? (
            <div ref={widgetRef} className="flex justify-center" />
          ) : (
            <p className="text-xs text-danger">Captcha not configured. Admin must set NEXT_PUBLIC_TURNSTILE_SITE_KEY.</p>
          )}

          {error && <p className="text-danger text-sm">{error}</p>}
          <button type="submit" disabled={pending || !siteKey} className="btn-primary w-full">
            {pending ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="text-xs text-text-muted text-center mt-4">
          Already have an account? <Link href="/login" className="text-primary">Sign in</Link>
        </p>
      </div>
    </>
  );
}
