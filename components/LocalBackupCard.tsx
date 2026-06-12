'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';

type ImportStats = {
  pilot_updated?: boolean;
  flights_inserted?: number;
  verifications_inserted?: number;
  invoices_inserted?: number;
  skipped_duplicates?: number;
  error?: string;
};

type XlsxMode = 'single' | 'multi' | 'year';

function recentMonths(n: number): Array<{ value: string; label: string; year: number }> {
  const out: Array<{ value: string; label: string; year: number }> = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d);
    out.push({ value, label, year: d.getFullYear() });
  }
  return out;
}

export function LocalBackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const months = useMemo(() => recentMonths(24), []);
  const years = useMemo(() => [...new Set(months.map(m => m.year))].sort((a, b) => b - a), [months]);

  const [xlsxMode, setXlsxMode] = useState<XlsxMode>('single');
  const [xlsxMonth, setXlsxMonth] = useState(months[1]?.value ?? months[0].value);
  const [xlsxYear, setXlsxYear] = useState(years[0]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function onDownloadJson() {
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

  function buildXlsxUrl(): string | null {
    if (xlsxMode === 'single') {
      return `/api/backup/xlsx?month=${xlsxMonth}`;
    }
    if (xlsxMode === 'year') {
      return `/api/backup/xlsx?year=${xlsxYear}`;
    }
    if (selected.size === 0) return null;
    const list = [...selected].sort().map(m => m.slice(0, 7)).join(',');
    return `/api/backup/xlsx?months=${list}`;
  }

  function toggleMonth(value: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }

  const xlsxUrl = buildXlsxUrl();

  return (
    <div className="space-y-4">
      {/* JSON backup */}
      <div className="space-y-3">
        <p className="text-sm text-text-muted">
          Download all your data as a JSON file you can keep locally. You can re-import it later
          if you ever lose access — duplicates are skipped, nothing is overwritten.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDownloadJson}
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
      </div>

      {/* Excel backup */}
      <div className="border-t border-border pt-3 space-y-3">
        <p className="text-sm text-text-muted">
          Flight log as Excel (same layout as the Drive backup) — pick a single month, multiple
          months, or a whole year.
        </p>

        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['single', 'Single month'],
            ['multi', 'Multiple'],
            ['year', 'Full year'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setXlsxMode(mode)}
              className={`min-h-tap rounded-lg border text-xs px-2 ${
                xlsxMode === mode
                  ? 'border-primary bg-primary/5 text-primary-dark'
                  : 'border-border text-text-muted'
              }`}
            >{label}</button>
          ))}
        </div>

        {xlsxMode === 'single' && (
          <div className="flex gap-2">
            <select
              value={xlsxMonth}
              onChange={e => setXlsxMonth(e.target.value)}
              className="flex-1 min-h-tap rounded-lg border border-border px-3 py-2 bg-white text-sm"
            >
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <a
              href={xlsxUrl ?? '#'}
              className="btn-ghost border border-border inline-flex items-center justify-center gap-2 px-4"
              download
            >
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </a>
          </div>
        )}

        {xlsxMode === 'year' && (
          <div className="flex gap-2">
            <select
              value={xlsxYear}
              onChange={e => setXlsxYear(Number(e.target.value))}
              className="flex-1 min-h-tap rounded-lg border border-border px-3 py-2 bg-white text-sm"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <a
              href={xlsxUrl ?? '#'}
              className="btn-ghost border border-border inline-flex items-center justify-center gap-2 px-4"
              download
            >
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </a>
          </div>
        )}

        {xlsxMode === 'multi' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto p-2 rounded-lg border border-border bg-bg-subtle/30">
              {months.map(m => {
                const checked = selected.has(m.value);
                return (
                  <label
                    key={m.value}
                    className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded cursor-pointer ${
                      checked ? 'bg-primary/10' : 'hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMonth(m.value)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    {m.label}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
                className="text-xs text-text-muted underline-offset-2 hover:underline disabled:opacity-50"
              >
                Clear selection
              </button>
              <div className="flex-1 text-xs text-text-muted text-right">
                {selected.size} month{selected.size === 1 ? '' : 's'} selected
              </div>
            </div>
            <a
              href={xlsxUrl ?? '#'}
              onClick={e => { if (!xlsxUrl) e.preventDefault(); }}
              className={`btn-ghost border border-border w-full inline-flex items-center justify-center gap-2 ${
                xlsxUrl ? '' : 'opacity-50 pointer-events-none'
              }`}
              download
            >
              <FileSpreadsheet className="w-4 h-4" /> Download {selected.size > 0 ? `${selected.size} months` : 'Excel'}
            </a>
          </div>
        )}
      </div>

      {/* VAT semester report */}
      <div className="border-t border-border pt-3 space-y-2">
        <p className="text-sm text-text-muted">
          VAT (MWST) semester report — gross / VAT / net per month and company,
          ready to forward to the accountant or upload to ESTV. Sent automatically
          on June 30 and December 31.
        </p>
        <div className="flex gap-2">
          <select
            value={xlsxYear}
            onChange={e => setXlsxYear(Number(e.target.value))}
            className="flex-1 min-h-tap rounded-lg border border-border px-3 py-2 bg-white text-sm"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <a
            href={`/api/backup/vat-report?year=${xlsxYear}&half=H1`}
            className="btn-ghost border border-border inline-flex items-center justify-center gap-2 px-3 text-sm"
            download
          >
            <FileSpreadsheet className="w-4 h-4" /> H1
          </a>
          <a
            href={`/api/backup/vat-report?year=${xlsxYear}&half=H2`}
            className="btn-ghost border border-border inline-flex items-center justify-center gap-2 px-3 text-sm"
            download
          >
            <FileSpreadsheet className="w-4 h-4" /> H2
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
