'use client';

import { useState } from 'react';
import { Check, AlertTriangle, Copy } from 'lucide-react';
import type { MigrationProbe } from '@/lib/setupProbe';

export function SetupStatusCard({ missing }: { missing: MigrationProbe[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copySql(id: string, sql: string) {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  }

  if (missing.length === 0) {
    return (
      <p className="text-xs text-text-muted px-1 inline-flex items-center gap-1">
        <Check className="w-3.5 h-3.5 text-success" />
        Setup current — all migrations active.
      </p>
    );
  }

  return (
    <fieldset className="card p-4 space-y-3 border-l-4 border-l-warning">
      <legend className="px-2 -ml-2 text-sm font-display font-semibold text-text-muted uppercase tracking-wide">
        Setup status
      </legend>
      <div className="flex items-start gap-2 text-sm">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">
            {missing.length} migration{missing.length === 1 ? '' : 's'} missing
          </div>
          <p className="text-text-muted text-xs">
            Some features only become active after these DB updates. Copy the SQL and run it in the Supabase SQL editor.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {missing.map(m => (
          <li key={m.id} className="rounded-lg border border-border bg-bg-subtle/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-mono text-xs text-text-muted">{m.file}</div>
                <div className="text-sm">{m.label}</div>
              </div>
              <button
                onClick={() => copySql(m.id, m.sql)}
                className="btn-ghost border border-border text-xs"
                type="button"
              >
                {copied === m.id ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copied === m.id ? 'Copied' : 'SQL'}
              </button>
            </div>
            <pre className="text-xs bg-white border border-border rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap break-all">{m.sql}</pre>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
