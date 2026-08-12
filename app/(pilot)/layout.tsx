import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/BottomNav';
import { PilotHeader } from '@/components/PilotHeader';
import { DemoBanner } from '@/components/DemoBanner';
import { requireAdmin } from '@/lib/adminAuth';

export default async function PilotLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase
    .from('pilots')
    .select('id, full_name, iban')
    .eq('id', user.id)
    .maybeSingle();

  // pilot_type is fetched separately so the layout still works on Supabase
  // instances where migration 023 hasn't run yet (the column would otherwise
  // fail the whole SELECT and blank the header).
  let independent = false;
  const { data: typeRow } = await supabase
    .from('pilots')
    .select('pilot_type')
    .eq('id', user.id)
    .maybeSingle();
  if ((typeRow as { pilot_type?: string } | null)?.pilot_type === 'independent') {
    independent = true;
  }

  // Admins can also be flying pilots (the owner logs flights daily). Don't
  // trap them in the admin area — they use the pilot app like everyone else
  // and reach admin via the Shield link in the header. Incomplete profiles
  // are handled by each page's own /onboarding redirect.
  const isAdmin = !!(await requireAdmin(supabase));

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
    <div className={`min-h-dvh flex flex-col bg-bg${independent ? ' theme-independent' : ''}`}>
      {demoExpiresAt && <DemoBanner expiresAt={demoExpiresAt} />}
      <PilotHeader pilotLabel={pilot?.full_name ?? user.email ?? ''} isAdmin={isAdmin} />
      <main className="flex-1 pb-24">{children}</main>
      <BottomNav independent={independent} />
    </div>
  );
}
