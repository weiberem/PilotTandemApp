'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
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
          If an account exists for <span className="font-mono">{email}</span>, we sent a password
          reset link. Click it to set a new password.
        </p>
        <Link href="/login" className="btn-ghost w-full">Back to Sign In</Link>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-display font-semibold mb-4">Reset password</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
            autoComplete="email"
          />
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="text-xs text-text-muted text-center mt-4">
        Remembered it? <Link href="/login" className="text-primary">Sign in</Link>
      </p>
    </div>
  );
}
