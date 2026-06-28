import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plane } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/OnboardingWizard';

export const dynamic = 'force-dynamic';

type PilotRow = {
  full_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  iban: string | null;
  vat_number: string | null;
  vat_registered: boolean | null;
  primary_company_name: string | null;
  primary_company_address: string | null;
  office_email: string | null;
  personal_email: string | null;
  flight_rate_chf: number | null;
  photo_prepaid_rate_chf: number | null;
  thermal_rate_chf: number | null;
  no_show_rate_chf: number | null;
  default_exclude_7am: boolean | null;
  default_exclude_5pm: boolean | null;
};

export default async function OnboardingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('pilots')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  const pilot = (data ?? null) as PilotRow | null;

  // Admin-only accounts skip pilot onboarding and go straight to the admin area.
  if (!pilot?.full_name || !pilot?.iban) {
    const { data: adminRow } = await supabase.from('admins').select('id').eq('id', user.id).maybeSingle();
    if (adminRow) redirect('/admin');
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-bg-dark text-white px-6 py-6 text-center">
        <div className="inline-flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-white">
            <Plane className="w-5 h-5 -rotate-45" />
          </span>
          <span className="text-2xl font-display font-bold tracking-tight">
            Tandem<span className="text-primary">Log</span>
          </span>
        </div>
        <p className="text-white/70 text-sm mt-2">Welcome — let's quickly set up your profile.</p>
      </header>

      <OnboardingWizard
        pilot={pilot ?? {
          full_name: null, address_line1: null, address_line2: null, postal_code: null, city: null,
          iban: null, vat_number: null, vat_registered: null,
          primary_company_name: null, primary_company_address: null,
          office_email: null, personal_email: null,
          flight_rate_chf: null, photo_prepaid_rate_chf: null, thermal_rate_chf: null, no_show_rate_chf: null,
          default_exclude_7am: null, default_exclude_5pm: null,
        }}
        authEmail={user.email ?? ''}
      />

      <div className="text-center pb-8">
        <Link href="/settings" className="text-xs text-text-muted hover:underline">
          Later — go straight to Settings
        </Link>
      </div>
    </div>
  );
}
