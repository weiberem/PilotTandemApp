'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton({ label = 'Abmelden' }: { label?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="w-full min-h-tap inline-flex items-center justify-center gap-2 rounded-lg border border-danger/30 text-danger px-3 py-2 hover:bg-danger/5 active:bg-danger/10 disabled:opacity-50"
    >
      <LogOut className="w-4 h-4" />
      {pending ? 'Abmelden…' : label}
    </button>
  );
}
