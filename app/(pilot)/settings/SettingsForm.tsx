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
    primary_company_name: pilot?.primary_company_name ?? 'Skywings Adventures GmbH',
    primary_company_address: pilot?.primary_company_address ?? 'Brandstrasse 38, 3852 Ringgenberg',
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
      setMsg({ kind: 'ok', text: 'Gespeichert.' });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Persönlich">
        <Input label="Voller Name *" value={form.full_name ?? ''} onChange={v => set('full_name', v)} required />
        <Input label="Adresse" value={form.address_line1 ?? ''} onChange={v => set('address_line1', v)} />
        <Input label="Adresszusatz" value={form.address_line2 ?? ''} onChange={v => set('address_line2', v)} />
        <div className="grid grid-cols-3 gap-2">
          <Input label="PLZ" value={form.postal_code ?? ''} onChange={v => set('postal_code', v)} className="col-span-1" />
          <Input label="Ort" value={form.city ?? ''} onChange={v => set('city', v)} className="col-span-2" />
        </div>
        <Input label="IBAN *" value={form.iban ?? ''} onChange={v => set('iban', v)} required />
        <Input label="MwSt.-Nummer" value={form.vat_number ?? ''} onChange={v => set('vat_number', v)} placeholder="CHE-…" />
      </Section>

      <Section title="Primärfirma">
        <Input label="Firmenname" value={form.primary_company_name ?? ''} onChange={v => set('primary_company_name', v)} />
        <Input label="Firmenadresse" value={form.primary_company_address ?? ''} onChange={v => set('primary_company_address', v)} />
      </Section>

      <Section title="E-Mails">
        <Input label="Office E-Mail (Rechnung an)" type="email" value={form.office_email ?? ''} onChange={v => set('office_email', v)} />
        <Input label="Persönliche E-Mail (Kopie)" type="email" value={form.personal_email ?? ''} onChange={v => set('personal_email', v)} />
        <Input label="CC-Empfänger Rechnung" type="email" value={form.invoice_cc_email ?? ''} onChange={v => set('invoice_cc_email', v)} placeholder="optional" />
      </Section>

      <Section title="Tarife (CHF)">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Flug" value={form.flight_rate_chf ?? 0} onChange={v => set('flight_rate_chf', v)} />
          <NumberInput label="Photo Prepaid" value={form.photo_prepaid_rate_chf ?? 0} onChange={v => set('photo_prepaid_rate_chf', v)} />
          <NumberInput label="Thermal" value={form.thermal_rate_chf ?? 0} onChange={v => set('thermal_rate_chf', v)} />
          <NumberInput label="No-Show" value={form.no_show_rate_chf ?? 0} onChange={v => set('no_show_rate_chf', v)} />
        </div>
      </Section>

      <Section title="Saison">
        <label className="block">
          <span className="text-sm font-medium">Saison-Override</span>
          <select
            value={form.season_override ?? ''}
            onChange={e => set('season_override', (e.target.value || null) as 'summer' | 'winter' | null)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
          >
            <option value="">Automatisch (Sommer Apr–Okt, Winter Nov–Mär)</option>
            <option value="summer">Sommer erzwingen</option>
            <option value="winter">Winter erzwingen</option>
          </select>
        </label>
      </Section>

      <Section title="Google Drive">
        <Input
          label="Hauptordner für Rechnungen & Backups"
          value={form.google_drive_folder_id ?? ''}
          onChange={v => set('google_drive_folder_id', extractDriveId(v))}
          placeholder="ID oder Drive-Link …/folders/XXX"
        />
        <Input
          label="Einsatzplan-Ordner (Skywings legt neue Datei jeden Monat ab)"
          value={form.einsatzplan_folder_id ?? ''}
          onChange={v => set('einsatzplan_folder_id', extractDriveId(v))}
          placeholder="ID oder Drive-Link …/folders/XXX"
        />
        <Input
          label="Einsatzplan einzelne Datei-ID (Fallback, optional)"
          value={form.einsatzplan_file_id ?? ''}
          onChange={v => set('einsatzplan_file_id', extractDriveId(v))}
          placeholder="nur falls Ordner nicht funktioniert"
        />
        <p className="text-xs text-text-muted">
          Tipp: Du kannst den ganzen Drive-Link einfügen — die ID wird automatisch extrahiert.
          Mit Ordner-ID zieht die App immer die neueste Excel-Datei aus dem Ordner.
        </p>
      </Section>

      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? 'Speichere…' : 'Speichern'}
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
