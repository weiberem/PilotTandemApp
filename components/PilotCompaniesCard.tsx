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
  trip_times_mode: 'manual' | 'fixed';
  trip_times_csv: string;
  color_hex: string;
};

function emptyDraft(): Draft {
  return {
    name: '', address: '', office_email: '',
    flight_rate_chf: '', photo_prepaid_rate_chf: '', thermal_rate_chf: '', no_show_rate_chf: '',
    trip_times_mode: 'manual', trip_times_csv: '',
    color_hex: '#7B6D8D',
  };
}

function fromCompany(c: PilotCompany): Draft {
  return {
    name: c.name,
    address: c.address ?? '',
    office_email: c.office_email ?? '',
    flight_rate_chf: c.flight_rate_chf?.toString() ?? '',
    photo_prepaid_rate_chf: c.photo_prepaid_rate_chf?.toString() ?? '',
    thermal_rate_chf: c.thermal_rate_chf?.toString() ?? '',
    no_show_rate_chf: c.no_show_rate_chf?.toString() ?? '',
    trip_times_mode: c.trip_times ? 'fixed' : 'manual',
    trip_times_csv: (c.trip_times ?? []).join(', '),
    color_hex: c.color_hex,
  };
}

export function PilotCompaniesCard({ initial, primaryRates }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [companies, setCompanies] = useState<PilotCompany[]>(initial);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

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
    const times = draft.trip_times_mode === 'fixed'
      ? draft.trip_times_csv.split(',').map(s => s.trim()).filter(s => /^\d{1,2}:\d{2}$/.test(s)).map(s => s.padStart(5, '0')).sort()
      : null;
    if (draft.trip_times_mode === 'fixed' && (!times || times.length === 0)) {
      setMsg({ kind: 'err', text: 'Enter at least one valid trip time (HH:MM)' });
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
      trip_times: times,
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

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        Add other companies you sometimes fly for (AlpinAir, Twin, …). Flights for these go on
        a separate invoice, with their own rates if set. Skywings stays as your primary in
        the section above.
      </p>

      {companies.length === 0 && editingId !== 'new' && (
        <p className="text-xs text-text-muted italic">No extra companies yet.</p>
      )}

      <ul className="space-y-2">
        {companies.map(c => (
          <li key={c.id} className="rounded-lg border border-border overflow-hidden">
            {editingId === c.id ? (
              <CompanyForm
                draft={draft} setDraft={setDraft} primaryRates={primaryRates}
                onApplySuggestion={applySuggestion}
                onSave={save} onCancel={cancel}
                pending={pending} title="Edit company"
              />
            ) : (
              <div className="flex items-center gap-3 p-3">
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
                      <> · {c.trip_times.length} fixed times</>
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
            )}
          </li>
        ))}
      </ul>

      {editingId === 'new' && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 overflow-hidden">
          <CompanyForm
            draft={draft} setDraft={setDraft} primaryRates={primaryRates}
            onApplySuggestion={applySuggestion}
            onSave={save} onCancel={cancel}
            pending={pending} title="New company"
          />
        </div>
      )}

      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>
          {msg.text}
        </p>
      )}

      {editingId === null && (
        <button type="button" onClick={startNew} className="btn-ghost w-full border border-border inline-flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Add company
        </button>
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => set('trip_times_mode', 'manual')}
            className={`flex-1 min-h-tap rounded-lg border text-sm ${
              draft.trip_times_mode === 'manual'
                ? 'border-primary bg-primary/5 text-primary-dark'
                : 'border-border text-text-muted'
            }`}
          >Enter manually each flight</button>
          <button
            type="button"
            onClick={() => set('trip_times_mode', 'fixed')}
            className={`flex-1 min-h-tap rounded-lg border text-sm ${
              draft.trip_times_mode === 'fixed'
                ? 'border-primary bg-primary/5 text-primary-dark'
                : 'border-border text-text-muted'
            }`}
          >Fixed schedule</button>
        </div>
        {draft.trip_times_mode === 'fixed' && (
          <Input
            label="Trip times (comma-separated HH:MM)"
            value={draft.trip_times_csv}
            onChange={v => set('trip_times_csv', v)}
            placeholder="08:30, 10:00, 11:30, 13:30, 15:00"
          />
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
