'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowLeft, Check, Plane } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveOnboardingStep } from '@/app/onboarding/actions';

type Pilot = {
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
  flight_rate_chf: number | null;
  photo_prepaid_rate_chf: number | null;
  thermal_rate_chf: number | null;
  no_show_rate_chf: number | null;
};

type State = {
  full_name: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  iban: string;
  vat_number: string;
  primary_company_name: string;
  primary_company_address: string;
  office_email: string;
  personal_email: string;
  flight_rate_chf: number;
  photo_prepaid_rate_chf: number;
  thermal_rate_chf: number;
  no_show_rate_chf: number;
};

const STEPS = [
  { key: 'profile', label: 'Profile' },
  { key: 'iban', label: 'Bank' },
  { key: 'email', label: 'Invoice email' },
  { key: 'company', label: 'Company & rates' },
  { key: 'done', label: 'Done' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export function OnboardingWizard({ pilot, authEmail }: { pilot: Pilot; authEmail: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<State>({
    full_name: pilot.full_name ?? '',
    address_line1: pilot.address_line1 ?? '',
    address_line2: pilot.address_line2 ?? '',
    postal_code: pilot.postal_code ?? '',
    city: pilot.city ?? '',
    iban: pilot.iban ?? '',
    vat_number: pilot.vat_number ?? '',
    primary_company_name: pilot.primary_company_name ?? 'Skywings Adventures GmbH',
    primary_company_address: pilot.primary_company_address ?? 'Brandstrasse 38, 3852 Ringgenberg',
    office_email: pilot.office_email ?? '',
    personal_email: pilot.personal_email ?? authEmail,
    flight_rate_chf: pilot.flight_rate_chf ?? 105,
    photo_prepaid_rate_chf: pilot.photo_prepaid_rate_chf ?? 40,
    thermal_rate_chf: pilot.thermal_rate_chf ?? 50,
    no_show_rate_chf: pilot.no_show_rate_chf ?? 32,
  });

  // Skip past steps that are already complete on first render.
  const [stepIdx, setStepIdx] = useState(() => {
    if (!state.full_name) return 0;
    if (!state.iban) return 1;
    if (!state.office_email) return 2;
    return 3;
  });
  const step: StepKey = STEPS[stepIdx].key;

  function set<K extends keyof State>(key: K, value: State[K]) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  function persistAndAdvance(patch: Partial<State>, nextIdx: number) {
    setError(null);
    startTransition(async () => {
      const r = await saveOnboardingStep(patch);
      if (!r.ok) { setError(r.error ?? 'Save failed'); return; }
      setStepIdx(nextIdx);
      if (STEPS[nextIdx].key === 'done') router.refresh();
    });
  }

  function next() {
    if (step === 'profile') {
      if (!state.full_name.trim()) { setError('Name is required.'); return; }
      persistAndAdvance({
        full_name: state.full_name,
        address_line1: state.address_line1,
        address_line2: state.address_line2,
        postal_code: state.postal_code,
        city: state.city,
      }, stepIdx + 1);
    } else if (step === 'iban') {
      if (!state.iban.trim()) { setError('IBAN is required — otherwise invoices cannot be sent.'); return; }
      persistAndAdvance({
        iban: state.iban.replace(/\s+/g, ''),
        vat_number: state.vat_number,
      }, stepIdx + 1);
    } else if (step === 'email') {
      if (!state.office_email.trim()) { setError('Office email is required — invoices are sent there.'); return; }
      persistAndAdvance({
        office_email: state.office_email,
        personal_email: state.personal_email,
      }, stepIdx + 1);
    } else if (step === 'company') {
      persistAndAdvance({
        primary_company_name: state.primary_company_name,
        primary_company_address: state.primary_company_address,
        flight_rate_chf: state.flight_rate_chf,
        photo_prepaid_rate_chf: state.photo_prepaid_rate_chf,
        thermal_rate_chf: state.thermal_rate_chf,
        no_show_rate_chf: state.no_show_rate_chf,
      }, stepIdx + 1);
    } else if (step === 'done') {
      router.push('/home');
    }
  }

  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-2">
        {STEPS.map((s, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <div
              key={s.key}
              className={cn(
                'h-2 rounded-full transition-all',
                done ? 'bg-success w-6' : active ? 'bg-primary w-10' : 'bg-border w-2',
              )}
              aria-label={s.label}
            />
          );
        })}
      </div>
      <p className="text-center text-xs text-text-muted">
        Step {Math.min(stepIdx + 1, STEPS.length - 1)} of {STEPS.length - 1} · {STEPS[stepIdx].label}
      </p>

      <div className="card p-5 space-y-4">
        {step === 'profile' && (
          <>
            <h2 className="font-display text-xl font-bold">Profile & address</h2>
            <p className="text-text-muted text-sm">
              These details appear in the header of your invoice.
            </p>
            <Input label="Full name" value={state.full_name} onChange={v => set('full_name', v)} placeholder="Rémy Weibel" required />
            <Input label="Street + no." value={state.address_line1} onChange={v => set('address_line1', v)} placeholder="Musterweg 12" />
            <Input label="Address line 2" value={state.address_line2} onChange={v => set('address_line2', v)} placeholder="(optional)" />
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <Input label="Postal code" value={state.postal_code} onChange={v => set('postal_code', v)} placeholder="3812" />
              <Input label="City" value={state.city} onChange={v => set('city', v)} placeholder="Wilderswil" />
            </div>
          </>
        )}

        {step === 'iban' && (
          <>
            <h2 className="font-display text-xl font-bold">Bank details</h2>
            <p className="text-text-muted text-sm">
              The IBAN is on every invoice. Required — otherwise sending is locked.
            </p>
            <Input
              label="IBAN" value={state.iban}
              onChange={v => set('iban', v.toUpperCase())}
              placeholder="CH00 0000 0000 0000 0000 0"
              required
            />
            <Input
              label="VAT number" value={state.vat_number}
              onChange={v => set('vat_number', v)}
              placeholder="CHE-123.456.789 MWST (optional)"
            />
            <p className="text-xs text-text-muted">
              Without a VAT number, the invoice runs at the current Swiss inclusive rate.
            </p>
          </>
        )}

        {step === 'email' && (
          <>
            <h2 className="font-display text-xl font-bold">Invoice recipients</h2>
            <p className="text-text-muted text-sm">
              Where does the monthly statement go? Your own account is added as CC.
            </p>
            <Input
              label="Office email (Skywings)" value={state.office_email}
              onChange={v => set('office_email', v)}
              placeholder="office@skywings.ch"
              type="email" required
            />
            <Input
              label="Your personal email" value={state.personal_email}
              onChange={v => set('personal_email', v)}
              placeholder="you@gmail.com"
              type="email"
            />
            <p className="text-xs text-text-muted">
              You'll get a copy of every sent invoice in CC.
            </p>
          </>
        )}

        {step === 'company' && (
          <>
            <h2 className="font-display text-xl font-bold">Company & rates</h2>
            <p className="text-text-muted text-sm">
              Defaults match the Skywings rates. Different company? Just change them.
            </p>
            <Input
              label="Primary company" value={state.primary_company_name}
              onChange={v => set('primary_company_name', v)}
              placeholder="Skywings Adventures GmbH"
            />
            <Input
              label="Company address" value={state.primary_company_address}
              onChange={v => set('primary_company_address', v)}
              placeholder="Brandstrasse 38, 3852 Ringgenberg"
            />
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="Flight" value={state.flight_rate_chf} onChange={v => set('flight_rate_chf', v)} />
              <NumInput label="Photo PP" value={state.photo_prepaid_rate_chf} onChange={v => set('photo_prepaid_rate_chf', v)} />
              <NumInput label="Thermal" value={state.thermal_rate_chf} onChange={v => set('thermal_rate_chf', v)} />
              <NumInput label="No-Show" value={state.no_show_rate_chf} onChange={v => set('no_show_rate_chf', v)} />
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="text-center space-y-3 py-4">
            <div className="inline-flex w-14 h-14 rounded-full bg-success/15 items-center justify-center">
              <Check className="w-7 h-7 text-success" />
            </div>
            <h2 className="font-display text-xl font-bold">Ready to go!</h2>
            <p className="text-text-muted text-sm">
              You can now log your first flight. Address, rates and Google Drive can be
              adjusted any time in Settings.
            </p>
            <button onClick={() => router.push('/home')} className="btn-primary w-full">
              <Plane className="w-4 h-4 mr-2 -rotate-45" /> Go to flight logging
            </button>
          </div>
        )}

        {error && step !== 'done' && <p className="text-xs text-danger">{error}</p>}

        {step !== 'done' && (
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={back}
              disabled={stepIdx === 0 || pending}
              className="btn-ghost border border-border"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={pending}
              className="btn-primary flex-1"
            >
              {pending ? 'Saving…' : <>Next <ArrowRight className="w-4 h-4 ml-1" /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, placeholder, required, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label} {required && <span className="text-danger">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
      />
    </label>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1 relative">
        <input
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="w-full min-h-tap rounded-lg border border-border bg-white pl-3 pr-12 py-2 font-mono"
          min={0}
          step={1}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
          CHF
        </span>
      </div>
    </label>
  );
}
