'use client';

import { useRouter } from 'next/navigation';

export function YearPicker({
  year, options,
}: { year: number; options: number[] }) {
  const router = useRouter();
  return (
    <label className="text-xs">
      <span className="text-text-muted block">Jahr</span>
      <select
        defaultValue={year}
        onChange={(e) => router.push(`/dashboard/stats?year=${e.target.value}`)}
        className="min-h-tap rounded-lg border border-border px-3 py-1.5 bg-white"
      >
        {options.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
  );
}
