'use client';

import { useState, useTransition } from 'react';
import { Copy, Check } from 'lucide-react';
import { setVkpiReported } from '@/app/(pilot)/dashboard/stats/actions';

export function VkpiReminder({
  year, count, reported,
}: { year: number; count: number; reported: boolean }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(count));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setVkpiReported(year, next);
      if (!r.ok) setError(r.error ?? 'Fehler');
    });
  }

  if (reported) {
    return (
      <p className="text-xs text-text-muted px-1">
        VKPI {year}: <span className="font-mono">{count}</span> Flüge · als gemeldet markiert
        <button
          onClick={() => toggle(false)}
          disabled={pending}
          className="text-primary underline-offset-2 hover:underline ml-2"
        >
          rückgängig
        </button>
      </p>
    );
  }

  return (
    <div className="card p-3 border-l-4 border-l-warning text-sm flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium">VKPI-Meldung {year}</div>
        <div className="text-text-muted text-xs">
          <span className="font-mono font-semibold text-text">{count}</span> abrechenbare Flüge
        </div>
      </div>
      <button onClick={copy} className="btn-ghost border border-border text-xs">
        {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
        {copied ? 'Kopiert' : 'Zahl kopieren'}
      </button>
      <button
        onClick={() => toggle(true)}
        disabled={pending}
        className="btn-ghost border border-border text-xs"
        title="VKPI-Meldung erledigt — diese Erinnerung ausblenden"
      >
        <Check className="w-3.5 h-3.5 mr-1" /> {pending ? '…' : 'Als gemeldet markieren'}
      </button>
      {error && <p className="basis-full text-xs text-danger">{error}</p>}
    </div>
  );
}
