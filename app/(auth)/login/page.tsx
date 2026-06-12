'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResendInfo(null);
    setNeedsConfirmation(false);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        // "Email not confirmed" surfaces a resend action.
        if (/not confirmed/i.test(error.message)) setNeedsConfirmation(true);
        return;
      }
      router.replace('/home');
      router.refresh();
    });
  }

  function resendConfirmation() {
    setResendInfo(null);
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/onboarding` },
      });
      if (error) { setError(error.message); return; }
      setResendInfo(`A new confirmation email was sent to ${email}. Click the link within 24 hours.`);
      setNeedsConfirmation(false);
    });
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-display font-semibold mb-4">Sign In</h1>
      <form onSubmit={onSubmit} className="space-y-4">
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
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
            autoComplete="current-password"
          />
          <div className="mt-1 text-right">
            <Link href="/forgot-password" className="text-xs text-text-muted hover:text-primary">
              Forgot password?
            </Link>
          </div>
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        {needsConfirmation && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
            <p className="text-sm">
              The confirmation link may have expired. Send a new one?
            </p>
            <button
              type="button"
              onClick={resendConfirmation}
              disabled={pending || !email}
              className="btn-ghost border border-warning/40 text-warning w-full"
            >
              {pending ? 'Sending…' : 'Resend confirmation email'}
            </button>
          </div>
        )}
        {resendInfo && <p className="text-success text-sm">{resendInfo}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
      <p className="text-xs text-text-muted text-center mt-4">
        No account yet? <Link href="/signup" className="text-primary">Create one</Link>
      </p>
    </div>
  );
}
