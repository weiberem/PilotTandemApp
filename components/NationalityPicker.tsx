'use client';

import { useState } from 'react';
import { rankCountries } from '@/lib/countries';

/**
 * Nationality combobox: type the first letters and matching countries appear,
 * ranked by how often this pilot has picked them (seeded with China / USA /
 * Südkorea / Indien on top). Free text is allowed too.
 */
export function NationalityPicker({
  value, counts, onChange,
}: {
  value: string | null;
  counts: Record<string, number>;
  onChange: (v: string | null) => void;
}) {
  const [query, setQuery] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const suggestions = rankCountries(query, counts).slice(0, 8);

  function choose(country: string) {
    setQuery(country);
    onChange(country);
    setOpen(false);
  }

  return (
    <label className="block text-xs relative">
      <span className="text-text-muted block mb-1">Nationalität Passagier</span>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value || null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Land eingeben …"
        className="w-full min-h-tap rounded-lg border border-border px-3 py-1.5 bg-white text-sm"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-border bg-white shadow-lg">
          {suggestions.map(c => (
            <li key={c}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); choose(c); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-bg-subtle flex items-center justify-between"
              >
                <span>{c}</span>
                {(counts[c] ?? 0) > 0 && <span className="text-[10px] text-text-muted">{counts[c]}×</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
