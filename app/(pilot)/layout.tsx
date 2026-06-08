import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/BottomNav';
import { PilotHeader } from '@/components/PilotHeader';
import { DemoBanner } from '@/components/DemoBanner';

export default async function PilotLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // First-run: if pilot profile is incomplete, send to /onboarding (except on /onboarding itself).
  const { data: pilot } = await supabase
    .from('pilots')
    .select('id, full_name, iban, primary_company_name')
    .eq('id', user.id)
    .maybeSingle();

  // Optional demo flag — fetched separately so the layout still works on
  // Supabase instances where migration 010 hasn't run.
  let demoExpiresAt: string | null = null;
  const { data: demoRow } = await supabase
    .from('pilots')
    .select('is_demo, demo_expires_at')
    .eq('id', user.id)
    .maybeSingle();
  if (demoRow && (demoRow as { is_demo?: boolean }).is_demo) {
    demoExpiresAt = (demoRow as { demo_expires_at?: string }).demo_expires_at ?? null;
  }

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      {demoExpiresAt && <DemoBanner expiresAt={demoExpiresAt} />}
      <PilotHeader pilotLabel={pilot?.full_name ?? user.email ?? ''} />
      <main className="flex-1 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
