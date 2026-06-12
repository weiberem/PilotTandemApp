'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // 1) Create the user server-side (pre-confirmed; SIGNUP_CODE-gated).
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, password, full_name: fullName,
          invite_code: inviteCode,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        const map: Record<string, string> = {
          invalid_invite_code: 'Wrong invite code — ask the team for the current one.',
          email_already_registered: 'That email is already registered. Sign in instead.',
          signup_not_configured: 'Signup is temporarily disabled. Please contact the admin.',
          missing_fields: 'Please fill in all fields.',
        };
        setError(map[data.error] ?? data.error ?? 'Signup failed');
        return;
      }
      // 2) Immediately sign the pilot in — no email round-trip.
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signErr) {
        setError(`Account created, but sign-in failed: ${signErr.message}. Try the Sign In page.`);
        return;
      }
      router.replace('/onboarding');
      router.refresh();
    });
  }

  return (
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

        {error && <p className="text-danger text-sm">{error}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="text-xs text-text-muted text-center mt-4">
        Already have an account? <Link href="/login" className="text-primary">Sign in</Link>
      </p>
    </div>
  );
}
