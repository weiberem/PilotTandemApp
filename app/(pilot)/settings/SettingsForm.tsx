'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { extractDriveId } from '@/lib/utils';

type Pilot = {
  id: string;
  full_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  iban: string | null;
  vat_number: string | null;
  primary_company_name: string | null;
  primary_company_address: string | null;
  office_email: string | null;
  personal_email: string | null;
  invoice_cc_email: string | null;
  google_drive_folder_id: string | null;
  einsatzplan_folder_id: string | null;
  einsatzplan_file_id: string | null;
  flight_rate_chf: number | null;
  photo_prepaid_rate_chf: number | null;
  thermal_rate_chf: number | null;
  no_show_rate_chf: number | null;
  season_override: 'summer' | 'winter' | null;
  auto_send_invoice: boolean | null;
  simple_capture: boolean | null;
} | null;

type Field = keyof NonNullable<Pilot>;

export function SettingsForm({ pilot, email }: { pilot: Pilot; email: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState<NonNullable<Pilot>>({
    id: pilot?.id ?? '',
    full_name: pilot?.full_name ?? '',
    address_line1: pilot?.address_line1 ?? '',
    address_line2: pilot?.address_line2 ?? '',
    postal_code: pilot?.postal_code ?? '',
    city: pilot?.city ?? '',
    iban: pilot?.iban ?? '',
    vat_number: pilot?.vat_number ?? '',
    primary_company_name: pilot?.primary_company_name ?? '',
    primary_company_address: pilot?.primary_company_address ?? '',
    office_email: pilot?.office_email ?? '',
    personal_email: pilot?.personal_email ?? email,
    invoice_cc_email: pilot?.invoice_cc_email ?? '',
    google_drive_folder_id: pilot?.google_drive_folder_id ?? '',
    einsatzplan_folder_id: pilot?.einsatzplan_folder_id ?? '',
    einsatzplan_file_id: pilot?.einsatzplan_file_id ?? '',
    flight_rate_chf: pilot?.flight_rate_chf ?? 105,
    photo_prepaid_rate_chf: pilot?.photo_prepaid_rate_chf ?? 40,
    thermal_rate_chf: pilot?.thermal_rate_chf ?? 50,
    no_show_rate_chf: pilot?.no_show_rate_chf ?? 32,
    season_override: pilot?.season_override ?? null,
    auto_send_invoice: pilot?.auto_send_invoice ?? false,
    simple_capture: pilot?.simple_capture ?? false,
  });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends Field>(key: K, value: NonNullable<Pilot>[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const { id, ...patch } = form;
      const { error } = await supabase.from('pilots').update(patch).eq('id', id);
      if (error) {
        setMsg({ kind: 'err', text: error.message });
        return;
      }
      setMsg({ kind: 'ok', text: 'Saved.' });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Personal">
        <Input label="Full name *" value={form.full_name ?? ''} onChange={v => set('full_name', v)} required />
        <Input label="Address" value={form.address_line1 ?? ''} onChange={v => set('address_line1', v)} />
        <Input label="Address line 2" value={form.address_line2 ?? ''} onChange={v => set('address_line2', v)} />
        <div className="grid grid-cols-3 gap-2">
          <Input label="Postal code" value={form.postal_code ?? ''} onChange={v => set('postal_code', v)} className="col-span-1" />
          <Input label="City" value={form.city ?? ''} onChange={v => set('city', v)} className="col-span-2" />
        </div>
        <Input label="IBAN *" value={form.iban ?? ''} onChange={v => set('iban', v)} required />
        <Input label="VAT number" value={form.vat_number ?? ''} onChange={v => set('vat_number', v)} placeholder="CHE-…" />
      </Section>

      <Section title="Primary company">
        <Input label="Company name" value={form.primary_company_name ?? ''} onChange={v => set('primary_company_name', v)} />
        <Input label="Company address" value={form.primary_company_address ?? ''} onChange={v => set('primary_company_address', v)} />
      </Section>

      <Section title="Emails">
        <Input label="Office email (invoice to)" type="email" value={form.office_email ?? ''} onChange={v => set('office_email', v)} />
        <Input label="Personal email (copy)" type="email" value={form.personal_email ?? ''} onChange={v => set('personal_email', v)} />
        <Input label="Invoice CC recipient" type="email" value={form.invoice_cc_email ?? ''} onChange={v => set('invoice_cc_email', v)} placeholder="optional" />
      </Section>

      <Section title="Rates (CHF)">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Flight" value={form.flight_rate_chf ?? 0} onChange={v => set('flight_rate_chf', v)} />
          <NumberInput label="Photo prepaid" value={form.photo_prepaid_rate_chf ?? 0} onChange={v => set('photo_prepaid_rate_chf', v)} />
          <NumberInput label="Thermal" value={form.thermal_rate_chf ?? 0} onChange={v => set('thermal_rate_chf', v)} />
          <NumberInput label="No-show" value={form.no_show_rate_chf ?? 0} onChange={v => set('no_show_rate_chf', v)} />
        </div>
      </Section>

      <Section title="Flight capture">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.simple_capture}
            onChange={e => set('simple_capture', e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-border accent-primary"
          />
          <span>
            <span className="text-sm font-medium block">Simplified day capture (AI screenshot)</span>
            <span className="text-xs text-text-muted">
              Instead of logging each flight, upload the end-of-day daysheet screenshot —
              AI counts the flights, you confirm and set the photo counters. Flights stay
              editable one tap away.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Invoicing">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.auto_send_invoice}
            onChange={e => set('auto_send_invoice', e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-border accent-primary"
          />
          <span>
            <span className="text-sm font-medium block">Send invoice automatically</span>
            <span className="text-xs text-text-muted">
              On the 1st of the month, if every flight day of the previous month is verified,
              the invoice goes straight to the office — no manual step.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Season">
        <label className="block">
          <span className="text-sm font-medium">Season override</span>
          <select
            value={form.season_override ?? ''}
            onChange={e => set('season_override', (e.target.value || null) as 'summer' | 'winter' | null)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
          >
            <option value="">Automatic (Summer Apr–Oct, Winter Nov–Mar)</option>
            <option value="summer">Force summer</option>
            <option value="winter">Force winter</option>
          </select>
        </label>
      </Section>

      <Section title="Google Drive">
        <Input
          label="Main folder for invoices & backups"
          value={form.google_drive_folder_id ?? ''}
          onChange={v => set('google_drive_folder_id', extractDriveId(v))}
          placeholder="ID or Drive link …/folders/XXX"
        />
        <Input
          label="Schedule folder (Skywings drops a new file every month)"
          value={form.einsatzplan_folder_id ?? ''}
          onChange={v => set('einsatzplan_folder_id', extractDriveId(v))}
          placeholder="ID or Drive link …/folders/XXX"
        />
        <Input
          label="Schedule single file ID (fallback, optional)"
          value={form.einsatzplan_file_id ?? ''}
          onChange={v => set('einsatzplan_file_id', extractDriveId(v))}
          placeholder="only if the folder doesn't work"
        />
        <p className="text-xs text-text-muted">
          Tip: You can paste the whole Drive link — the ID is extracted automatically.
          With a folder ID, the app always pulls the latest Excel file from the folder.
        </p>
      </Section>

      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-4 space-y-3">
      <legend className="px-2 -ml-2 text-sm font-display font-semibold text-text-muted uppercase tracking-wide">{title}</legend>
      {children}
    </fieldset>
  );
}

function Input({
  label, value, onChange, type = 'text', required, placeholder, className,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string; className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
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
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number" inputMode="decimal" step="0.01" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono"
      />
    </label>
  );
}
