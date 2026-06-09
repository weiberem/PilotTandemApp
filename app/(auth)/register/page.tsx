'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Used by the Supabase invite flow. Magic link lands here with a session,
 * then the user picks a password + full name and is redirected to /settings.
 */
export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user));
  }, [supabase]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName },
      });
      if (error) {
        setError(error.message);
        return;
      }
      // Sync full_name to pilots row.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('pilots').update({ full_name: fullName }).eq('id', user.id);
      }
      router.replace('/settings');
      router.refresh();
    });
  }

  if (!hasSession) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-display font-semibold mb-2">Invitation required</h1>
        <p className="text-sm text-text-muted mb-4">
          Accounts are created by invitation only. Please follow the link from your invitation email.
        </p>
        <Link href="/login" className="btn-ghost w-full">Back to Sign In</Link>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-display font-semibold mb-4">Set up account</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Full name</span>
          <input
            type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">New password</span>
          <input
            type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
            autoComplete="new-password"
          />
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? 'Saving…' : 'Activate account'}
        </button>
      </form>
    </div>
  );
}
