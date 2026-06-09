'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Landed here from the password-recovery email. Supabase has already exchanged
 * the recovery token for a session — we just collect the new password and
 * call updateUser.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user));
  }, [supabase]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      router.replace('/home');
      router.refresh();
    });
  }

  if (hasSession === false) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-display font-semibold mb-2">Link expired</h1>
        <p className="text-sm text-text-muted mb-4">
          This reset link is no longer valid. Request a new one.
        </p>
        <Link href="/forgot-password" className="btn-primary w-full">Request new link</Link>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-display font-semibold mb-4">Set new password</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">New password</span>
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
          {pending ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  );
}
