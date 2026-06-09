'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });
      if (error) {
        setError(error.message);
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
          activate your account, then you can sign in.
        </p>
        <Link href="/login" className="btn-ghost w-full">Back to Sign In</Link>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-display font-semibold mb-4">Create account</h1>
      <form onSubmit={onSubmit} className="space-y-4">
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
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="text-xs text-text-muted text-center mt-4">
        Already have an account? <Link href="/login" className="text-primary">Sign in</Link>
      </p>
    </div>
  );
}
