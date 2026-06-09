'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function SyncButton({ disabled, label = 'Sync' }: { disabled?: boolean; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function sync() {
    setErr(null);
    startTransition(async () => {
      const r = await fetch('/api/gdrive/sync', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error ?? 'Sync failed');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={sync}
        disabled={disabled || pending}
        className="btn-ghost border border-border text-sm inline-flex"
      >
        <RefreshCw className={`w-4 h-4 mr-1 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Sync…' : label}
      </button>
      {err && <p className="text-danger text-xs mt-1">{err}</p>}
    </div>
  );
}
