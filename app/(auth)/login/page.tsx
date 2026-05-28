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
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      router.replace('/');
      router.refresh();
    });
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-display font-semibold mb-4">Anmelden</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">E-Mail</span>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
            autoComplete="email"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Passwort</span>
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
            autoComplete="current-password"
          />
        </label>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>
      <p className="text-xs text-text-muted text-center mt-4">
        Konto auf Einladung. <Link href="/register" className="text-primary">Einladung einlösen</Link>
      </p>
    </div>
  );
}
