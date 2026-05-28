'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFlight } from '@/app/(pilot)/log/actions';
import { Trash2 } from 'lucide-react';

export function DeleteFlightButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  function doDelete() {
    startTransition(async () => {
      const r = await deleteFlight(id);
      if (r.ok) {
        router.push('/today');
        router.refresh();
      }
    });
  }

  if (!confirm) {
    return (
      <button type="button" onClick={() => setConfirm(true)} className="btn-ghost text-danger border border-danger/30 w-full">
        <Trash2 className="w-4 h-4 mr-2" /> Flug löschen
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm">Diesen Flug wirklich löschen?</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setConfirm(false)} className="btn-ghost flex-1 border border-border">Abbrechen</button>
        <button type="button" onClick={doDelete} disabled={pending} className="flex-1 min-h-tap rounded-lg bg-danger text-white">
          {pending ? 'Lösche…' : 'Ja, löschen'}
        </button>
      </div>
    </div>
  );
}
