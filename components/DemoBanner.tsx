'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

export function DemoBanner({ expiresAt }: { expiresAt: string }) {
  const [label, setLabel] = useState(() => formatRemaining(expiresAt));

  useEffect(() => {
    const t = setInterval(() => setLabel(formatRemaining(expiresAt)), 60_000);
    return () => clearInterval(t);
  }, [expiresAt]);

  return (
    <div className="bg-warning/15 border-b border-warning/30 text-warning text-xs px-3 py-1.5 flex items-center justify-center gap-2">
      <Sparkles className="w-3.5 h-3.5" />
      <span><strong>Demo-Modus</strong> · Daten verschwinden in {label} · Rechnungs-Senden wird simuliert</span>
    </div>
  );
}

function formatRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'wenigen Minuten';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
