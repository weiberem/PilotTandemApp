'use client';

import { useEffect, useState, useTransition } from 'react';
import { Sun, Snowflake, Wand2 } from 'lucide-react';

type Season = 'auto' | 'summer' | 'winter';

const OPTIONS: { value: Season; label: string; icon: typeof Sun; hint: string }[] = [
  { value: 'auto', label: 'Automatisch', icon: Wand2, hint: 'Nach Datum (Apr–Okt Sommer, sonst Winter)' },
  { value: 'summer', label: 'Sommer', icon: Sun, hint: 'Sommer-Zeiten erzwingen' },
  { value: 'winter', label: 'Winter', icon: Snowflake, hint: 'Winter-Zeiten erzwingen' },
];

export function AdminSeason() {
  const [season, setSeason] = useState<Season | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    const r = await fetch('/api/admin/settings');
    const data = await r.json();
    if (r.ok) setSeason((data.current_season as Season) ?? 'auto');
  }
  useEffect(() => { load(); }, []);

  function choose(value: Season) {
    setMsg(null);
    setSeason(value);
    startTransition(async () => {
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current_season: value }),
      });
      const data = await r.json();
      if (!r.ok) { setMsg({ kind: 'err', text: data.error ?? 'Error' }); load(); return; }
      setMsg({ kind: 'ok', text: 'Gespeichert.' });
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h2 className="font-display font-semibold">Saison (Sommer-/Winterzeiten)</h2>
        <p className="text-text-muted text-sm">
          Offizielle Saison fürs ganze Team. Piloten auf „Automatisch" folgen dieser Vorgabe.
          Wer selbst eine andere Saison erzwungen hat, sieht in der App einen Hinweis.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, icon: Icon, hint }) => {
          const active = season === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              disabled={pending}
              title={hint}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm ${
                active ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-text-muted'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          );
        })}
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>}
    </div>
  );
}
