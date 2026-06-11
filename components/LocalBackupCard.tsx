'use client';

import { useRef, useState, useTransition } from 'react';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';

function recentMonths(n: number): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d);
    out.push({ value, label });
  }
  return out;
}

type ImportStats = {
  pilot_updated?: boolean;
  flights_inserted?: number;
  verifications_inserted?: number;
  invoices_inserted?: number;
  skipped_duplicates?: number;
  error?: string;
};

export function LocalBackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const months = recentMonths(13);
  const [xlsxMonth, setXlsxMonth] = useState(months[1]?.value ?? months[0].value);

  function onDownload() {
    setMsg(null);
    window.location.href = '/api/backup/export';
  }

  function onPick() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setMsg(null);
    startTransition(async () => {
      let json: unknown;
      try {
        const text = await file.text();
        json = JSON.parse(text);
      } catch {
        setMsg({ kind: 'err', text: 'Could not read file — is it a valid backup JSON?' });
        return;
      }
      const r = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(json),
      });
      const data: ImportStats = await r.json();
      if (!r.ok) {
        setMsg({ kind: 'err', text: data.error ?? 'Import failed' });
        return;
      }
      const parts: string[] = [];
      if (data.flights_inserted) parts.push(`${data.flights_inserted} flights`);
      if (data.verifications_inserted) parts.push(`${data.verifications_inserted} verifications`);
      if (data.invoices_inserted) parts.push(`${data.invoices_inserted} invoices`);
      if (data.pilot_updated) parts.push('profile fields filled');
      const summary = parts.length > 0 ? parts.join(', ') : 'nothing new';
      const skipped = data.skipped_duplicates
        ? ` (${data.skipped_duplicates} duplicates skipped)`
        : '';
      setMsg({ kind: 'ok', text: `Imported: ${summary}${skipped}.` });
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        Download all your data as a JSON file you can keep locally. You can re-import it later
        if you ever lose access — duplicates are skipped, nothing is overwritten.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDownload}
          className="btn-ghost border border-border flex-1 inline-flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" /> Download backup
        </button>
        <button
          type="button"
          onClick={onPick}
          disabled={pending}
          className="btn-ghost border border-border flex-1 inline-flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" /> {pending ? 'Importing…' : 'Import backup'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          className="hidden"
        />
      </div>
      <div className="border-t border-border pt-3 space-y-2">
        <p className="text-sm text-text-muted">
          Month flight log as Excel (same layout as the Drive backup) — pick a month and download.
        </p>
        <div className="flex gap-2">
          <select
            value={xlsxMonth}
            onChange={e => setXlsxMonth(e.target.value)}
            className="flex-1 min-h-tap rounded-lg border border-border px-3 py-2 bg-white text-sm"
          >
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <a
            href={`/api/backup/xlsx?month=${xlsxMonth}`}
            className="btn-ghost border border-border inline-flex items-center justify-center gap-2 px-4"
            download
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </a>
        </div>
      </div>

      {msg && (
        <p
          className={
            msg.kind === 'ok' ? 'text-success text-sm'
            : msg.kind === 'err' ? 'text-danger text-sm'
            : 'text-text-muted text-sm'
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
