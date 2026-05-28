'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function VkpiCard({ year, count }: { year: number; count: number }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(count));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select-the-number path; ignore here since most browsers support clipboard.
    }
  }

  return (
    <div className="card p-6 bg-bg-dark text-white">
      <p className="text-xs uppercase tracking-wider text-white/60">
        Total Flüge {year} für VKPI-Meldung
      </p>
      <p className="font-mono font-bold text-6xl my-3 tabular-nums">{count}</p>
      <button onClick={copy} className="btn-primary inline-flex">
        {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
        {copied ? 'Kopiert' : 'In Zwischenablage kopieren'}
      </button>
    </div>
  );
}
