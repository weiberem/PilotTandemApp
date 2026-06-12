'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Used by the Supabase admin-invite flow. The magic link from the invitation
 * email lands here with a fresh session — the user picks a password + name
 * and is forwarded to /settings.
 *
 * SAFETY: if an already-onboarded pilot lands here (e.g. by typing the URL),
 * we redirect them away instead of letting them overwrite their own
 * full_name. A previous version did that and one wrong click in /admin
 * cascade-deleted everything.
 */
export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<'loading' | 'no_session' | 'already_onboarded' | 'ready'>('loading');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState('no_session'); return; }
      const { data: pilot } = await supabase
        .from('pilots')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (pilot?.full_name) { setState('already_onboarded'); return; }
      setState('ready');
    })();
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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('pilots').update({ full_name: fullName }).eq('id', user.id);
      }
      router.replace('/settings');
      router.refresh();
    });
  }

  if (state === 'loading') {
    return <div className="card p-6 text-sm text-text-muted">Loading…</div>;
  }

  if (state === 'no_session') {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-display font-semibold mb-2">Invitation required</h1>
        <p className="text-sm text-text-muted mb-4">
          This page is for redeeming an admin invitation. To open a new account yourself, use
          sign-up instead.
        </p>
        <Link href="/signup" className="btn-primary w-full mb-2">Create account</Link>
        <Link href="/login" className="btn-ghost w-full">Back to Sign In</Link>
      </div>
    );
  }

  if (state === 'already_onboarded') {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-display font-semibold mb-2">You're already signed in</h1>
        <p className="text-sm text-text-muted mb-4">
          This page is only for new invited users. To invite another pilot, use the admin area.
          To create a separate account, sign out first.
        </p>
        <Link href="/home" className="btn-primary w-full mb-2">Go to Home</Link>
        <Link href="/admin" className="btn-ghost w-full">Open admin</Link>
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
