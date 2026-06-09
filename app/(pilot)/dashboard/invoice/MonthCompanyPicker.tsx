'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const COMPANIES = ['Skywings', 'AlpinAir', 'Twin Paragliding'] as const;

export function MonthCompanyPicker({
  month, company, primaryCompany,
}: { month: string; company: string; primaryCompany: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [, startTransition] = useTransition();

  function setParam(key: 'month' | 'company', value: string) {
    const next = new URLSearchParams(search.toString());
    next.set(key, value);
    startTransition(() => router.replace(`?${next.toString()}`));
  }

  const monthInputValue = month.slice(0, 7); // YYYY-MM
  function onMonthChange(v: string) {
    if (/^\d{4}-\d{2}$/.test(v)) setParam('month', `${v}-01`);
  }

  const allCompanies = Array.from(new Set([primaryCompany, ...COMPANIES, company]));

  return (
    <div className="flex gap-2 items-end">
      <label className="block text-xs">
        <span className="text-text-muted block">Month</span>
        <input
          type="month"
          value={monthInputValue}
          onChange={e => onMonthChange(e.target.value)}
          className="min-h-tap rounded-lg border border-border px-3 py-1.5 bg-white font-mono"
        />
      </label>
      <label className="block text-xs">
        <span className="text-text-muted block">Company</span>
        <select
          value={company}
          onChange={e => setParam('company', e.target.value)}
          className="min-h-tap rounded-lg border border-border px-3 py-1.5 bg-white"
        >
          {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    </div>
  );
}
