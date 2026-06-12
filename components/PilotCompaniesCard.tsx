'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { type PilotCompany, COMPANY_SUGGESTIONS, suggestColor } from '@/lib/pilotCompanies';

type Props = {
  initial: PilotCompany[];
  primaryRates: {
    flight_rate_chf: number;
    photo_prepaid_rate_chf: number;
    thermal_rate_chf: number;
    no_show_rate_chf: number;
  };
};

type Draft = {
  name: string;
  address: string;
  office_email: string;
  flight_rate_chf: string;
  photo_prepaid_rate_chf: string;
  thermal_rate_chf: string;
  no_show_rate_chf: string;
  trip_times_mode: 'manual' | 'fixed' | 'seasonal';
  trip_times_csv: string;
  trip_times_winter_csv: string;
  color_hex: string;
};

function emptyDraft(): Draft {
  return {
    name: '', address: '', office_email: '',
    flight_rate_chf: '', photo_prepaid_rate_chf: '', thermal_rate_chf: '', no_show_rate_chf: '',
    trip_times_mode: 'manual', trip_times_csv: '', trip_times_winter_csv: '',
    color_hex: '#7B6D8D',
  };
}

function fromCompany(c: PilotCompany): Draft {
  const mode: Draft['trip_times_mode'] =
    c.trip_times_winter && c.trip_times_winter.length > 0 ? 'seasonal'
    : c.trip_times ? 'fixed'
    : 'manual';
  return {
    name: c.name,
    address: c.address ?? '',
    office_email: c.office_email ?? '',
    flight_rate_chf: c.flight_rate_chf?.toString() ?? '',
    photo_prepaid_rate_chf: c.photo_prepaid_rate_chf?.toString() ?? '',
    thermal_rate_chf: c.thermal_rate_chf?.toString() ?? '',
    no_show_rate_chf: c.no_show_rate_chf?.toString() ?? '',
    trip_times_mode: mode,
    trip_times_csv: (c.trip_times ?? []).join(', '),
    trip_times_winter_csv: (c.trip_times_winter ?? []).join(', '),
    color_hex: c.color_hex,
  };
}

function parseTimes(csv: string): string[] {
  return csv.split(',').map(s => s.trim())
    .filter(s => /^\d{1,2}:\d{2}$/.test(s))
    .map(s => s.padStart(5, '0'))
    .sort();
}

export function PilotCompaniesCard({ initial, primaryRates }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [companies, setCompanies] = useState<PilotCompany[]>(initial);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Toggle: "Also fly for other companies?" — when off, the picker stays
  // collapsed and no other-company fields are visible. Pre-enabled if the
  // pilot already has any registered company.
  const [enabled, setEnabled] = useState(initial.length > 0);
  // Selected tab in the picker (a registered company ID, or one of the
  // suggestion-slug strings 'alpinair' / 'twin' / 'swiss').
  const [activeKey, setActiveKey] = useState<string | null>(
    initial.length > 0 ? initial[0].id : null,
  );

  function startNew() {
    setDraft(emptyDraft());
    setEditingId('new');
    setMsg(null);
  }
  function startEdit(c: PilotCompany) {
    setDraft(fromCompany(c));
    setEditingId(c.id);
    setMsg(null);
  }
  function cancel() {
    setEditingId(null);
    setDraft(emptyDraft());
  }

  function applySuggestion(name: string, address: string) {
    setDraft(d => ({ ...d, name, address, color_hex: suggestColor(name) }));
  }

  function save() {
    setMsg(null);
    if (!draft.name.trim()) { setMsg({ kind: 'err', text: 'Name required' }); return; }
    const summer = draft.trip_times_mode === 'manual' ? null : parseTimes(draft.trip_times_csv);
    const winter = draft.trip_times_mode === 'seasonal' ? parseTimes(draft.trip_times_winter_csv) : null;
    if (draft.trip_times_mode !== 'manual' && (!summer || summer.length === 0)) {
      setMsg({ kind: 'err', text: 'Enter at least one valid summer trip time (HH:MM)' });
      return;
    }
    if (draft.trip_times_mode === 'seasonal' && (!winter || winter.length === 0)) {
      setMsg({ kind: 'err', text: 'Enter at least one valid winter trip time (HH:MM)' });
      return;
    }
    const payload = {
      name: draft.name.trim(),
      address: draft.address.trim() || null,
      office_email: draft.office_email.trim() || null,
      flight_rate_chf: numOrNull(draft.flight_rate_chf),
      photo_prepaid_rate_chf: numOrNull(draft.photo_prepaid_rate_chf),
      thermal_rate_chf: numOrNull(draft.thermal_rate_chf),
      no_show_rate_chf: numOrNull(draft.no_show_rate_chf),
      trip_times: summer,
      trip_times_winter: winter,
      color_hex: draft.color_hex,
    };
    startTransition(async () => {
      if (editingId === 'new') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from('pilot_companies')
          .insert({ ...payload, pilot_id: user.id, is_active: true })
          .select()
          .single();
        if (error) { setMsg({ kind: 'err', text: error.message }); return; }
        setCompanies(prev => [...prev, data as PilotCompany]);
      } else if (editingId) {
        const { data, error } = await supabase
          .from('pilot_companies')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single();
        if (error) { setMsg({ kind: 'err', text: error.message }); return; }
        setCompanies(prev => prev.map(c => c.id === editingId ? (data as PilotCompany) : c));
      }
      cancel();
      router.refresh();
    });
  }

  function remove(c: PilotCompany) {
    if (!confirm(`Remove ${c.name}? Past flights and invoices keep this company name — only the picker entry is removed.`)) return;
    startTransition(async () => {
      const { error } = await supabase.from('pilot_companies').delete().eq('id', c.id);
      if (error) { setMsg({ kind: 'err', text: error.message }); return; }
      setCompanies(prev => prev.filter(x => x.id !== c.id));
      router.refresh();
    });
  }

  // Suggestion chips ordered after the user's registered companies.
  const suggestionList = COMPANY_SUGGESTIONS.filter(s =>
    !companies.some(c => c.name === s.name)
  );

  function pickSuggestion(s: { name: string; address: string }) {
    const existing = companies.find(c => c.name === s.name);
    if (existing) {
      startEdit(existing);
      setActiveKey(existing.id);
    } else {
      startNew();
      setDraft(d => ({ ...d, name: s.name, address: s.address, color_hex: suggestColor(s.name) }));
      setActiveKey(`new:${s.name}`);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 cursor-pointer py-1">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => {
            const v = e.target.checked;
            setEnabled(v);
            if (!v) { setEditingId(null); setActiveKey(null); }
            else if (companies.length > 0 && !activeKey) setActiveKey(companies[0].id);
          }}
          className="mt-1 w-5 h-5 rounded border-border accent-primary"
        />
        <span>
          <span className="text-sm font-medium block">Also fly for other companies</span>
          <span className="text-xs text-text-muted">
            Switch on if you sometimes fly for AlpinAir, Twin, Swiss-Paragliding,
            etc. Each company gets its own rates and a separate invoice.
            Skywings stays your primary above — Drive, schedule import, daysheets
            and mail-to-office are Skywings-only.
          </span>
        </span>
      </label>

      {enabled && (
        <>
          {/* Tab strip: registered companies first, then suggestion chips. */}
          <div className="flex gap-1.5 flex-wrap items-center pt-1">
            {companies.map(c => {
              const isActive = activeKey === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setActiveKey(c.id); setEditingId(null); }}
                  className={`inline-flex items-center gap-1.5 rounded-full border text-xs px-3 py-1.5 ${
                    isActive ? 'border-primary bg-primary/10 text-primary-dark' : 'border-border text-text-muted hover:bg-bg-subtle'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: c.color_hex }}
                    aria-hidden
                  />
                  {c.name.replace(/ (GmbH|Paragliding)/g, '').trim()}
                </button>
              );
            })}
            {suggestionList.map(s => (
              <button
                key={s.name}
                type="button"
                onClick={() => pickSuggestion(s)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border text-xs px-3 py-1.5 text-text-muted hover:bg-bg-subtle"
              >
                <Plus className="w-3 h-3" />
                {s.name.replace(/ (GmbH|Paragliding)/g, '').trim()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { startNew(); setActiveKey('new:custom'); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border text-xs px-3 py-1.5 text-text-muted hover:bg-bg-subtle"
            >
              <Plus className="w-3 h-3" /> Other
            </button>
          </div>

          {/* Active panel: editing existing, creating new, or read-only view. */}
          {editingId === 'new' ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 overflow-hidden">
              <CompanyForm
                draft={draft} setDraft={setDraft} primaryRates={primaryRates}
                onApplySuggestion={applySuggestion}
                onSave={save} onCancel={cancel}
                pending={pending} title="New company"
              />
            </div>
          ) : activeKey && editingId === activeKey ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 overflow-hidden">
              <CompanyForm
                draft={draft} setDraft={setDraft} primaryRates={primaryRates}
                onApplySuggestion={applySuggestion}
                onSave={save} onCancel={cancel}
                pending={pending} title="Edit company"
              />
            </div>
          ) : activeKey && companies.find(c => c.id === activeKey) ? (
            (() => {
              const c = companies.find(x => x.id === activeKey)!;
              return (
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: c.color_hex }}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-text-muted truncate">
                        {c.address ?? '—'}
                        {c.trip_times && c.trip_times.length > 0 && (
                          <> · {c.trip_times.length} times{c.trip_times_winter ? ' (sum/win)' : ''}</>
                        )}
                        {c.flight_rate_chf != null && <> · {c.flight_rate_chf} CHF/flight</>}
                      </div>
                    </div>
                    <button type="button" onClick={() => startEdit(c)} className="p-2 text-text-muted hover:text-text" aria-label="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(c)} disabled={pending} className="p-2 text-danger/70 hover:text-danger" aria-label="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            companies.length === 0 && editingId !== 'new' && (
              <p className="text-xs text-text-muted italic">
                Pick a company above to register it.
              </p>
            )
          )}
        </>
      )}

      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function CompanyForm({
  draft, setDraft, primaryRates, onApplySuggestion, onSave, onCancel, pending, title,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  primaryRates: Props['primaryRates'];
  onApplySuggestion: (name: string, address: string) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  title: string;
}) {
  function set<K extends keyof Draft>(k: K, v: Draft[K]) { setDraft({ ...draft, [k]: v }); }
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-text-muted" />
        <span className="font-display font-semibold text-sm">{title}</span>
      </div>

      {COMPANY_SUGGESTIONS.length > 0 && draft.name === '' && (
        <div className="space-y-1.5">
          <div className="text-xs text-text-muted">Suggestions</div>
          <div className="flex flex-wrap gap-1.5">
            {COMPANY_SUGGESTIONS.map(s => (
              <button
                key={s.name} type="button"
                onClick={() => onApplySuggestion(s.name, s.address)}
                className="text-xs rounded-full border border-border px-2.5 py-1 hover:bg-bg-subtle"
              >
                {s.name.replace(/ (GmbH|Paragliding)/g, '').trim()}
              </button>
            ))}
          </div>
        </div>
      )}

      <Input label="Company name" value={draft.name} onChange={v => set('name', v)} required />
      <Input label="Address" value={draft.address} onChange={v => set('address', v)} placeholder="Street, ZIP City" />
      <Input label="Office email (for invoice)" value={draft.office_email} onChange={v => set('office_email', v)} type="email" placeholder="leave blank to use primary office email" />

      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Flight CHF" value={draft.flight_rate_chf} onChange={v => set('flight_rate_chf', v)} placeholder={String(primaryRates.flight_rate_chf)} />
        <NumberInput label="Photo PP CHF" value={draft.photo_prepaid_rate_chf} onChange={v => set('photo_prepaid_rate_chf', v)} placeholder={String(primaryRates.photo_prepaid_rate_chf)} />
        <NumberInput label="Thermal CHF" value={draft.thermal_rate_chf} onChange={v => set('thermal_rate_chf', v)} placeholder={String(primaryRates.thermal_rate_chf)} />
        <NumberInput label="No-Show CHF" value={draft.no_show_rate_chf} onChange={v => set('no_show_rate_chf', v)} placeholder={String(primaryRates.no_show_rate_chf)} />
      </div>
      <p className="text-xs text-text-muted -mt-1">Leave a rate empty to use your primary rate.</p>

      <div className="space-y-2">
        <div className="text-sm font-medium">Trip times</div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['manual', 'Manual'],
            ['fixed', 'Year-round'],
            ['seasonal', 'Summer + Winter'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode} type="button"
              onClick={() => set('trip_times_mode', mode)}
              className={`min-h-tap rounded-lg border text-xs px-2 ${
                draft.trip_times_mode === mode
                  ? 'border-primary bg-primary/5 text-primary-dark'
                  : 'border-border text-text-muted'
              }`}
            >{label}</button>
          ))}
        </div>
        {draft.trip_times_mode === 'fixed' && (
          <Input
            label="Trip times (HH:MM, comma-separated)"
            value={draft.trip_times_csv}
            onChange={v => set('trip_times_csv', v)}
            placeholder="08:30, 10:00, 11:30, 13:30, 15:00"
          />
        )}
        {draft.trip_times_mode === 'seasonal' && (
          <>
            <Input
              label="Summer times (Apr–Oct)"
              value={draft.trip_times_csv}
              onChange={v => set('trip_times_csv', v)}
              placeholder="07:10, 08:10, 09:20, 10:30, 11:45, 13:30, 14:45, 16:00, 17:00"
            />
            <Input
              label="Winter times (Nov–Mar)"
              value={draft.trip_times_winter_csv}
              onChange={v => set('trip_times_winter_csv', v)}
              placeholder="08:30, 09:45, 11:00, 12:15, 13:45, 15:00"
            />
            <p className="text-xs text-text-muted">
              Auto-switches based on your season setting in the Skywings card above.
            </p>
          </>
        )}
        {draft.trip_times_mode === 'manual' && (
          <p className="text-xs text-text-muted">
            You'll enter the time freely for each flight.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span>Colour</span>
          <input
            type="color" value={draft.color_hex}
            onChange={e => set('color_hex', e.target.value)}
            className="w-8 h-8 rounded border border-border cursor-pointer"
          />
        </label>
        <span className="text-xs text-text-muted">Shown next to each flight & on the invoice.</span>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 border border-border">
          <X className="w-4 h-4 mr-1" /> Cancel
        </button>
        <button type="button" onClick={onSave} disabled={pending} className="btn-primary flex-1">
          <Check className="w-4 h-4 mr-1" /> {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function numOrNull(s: string): number | null {
  const n = Number(s);
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
}

function Input({
  label, value, onChange, type = 'text', required, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        required={required} placeholder={placeholder}
        className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
      />
    </label>
  );
}

function NumberInput({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number" inputMode="decimal" step="0.01" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono"
      />
    </label>
  );
}
