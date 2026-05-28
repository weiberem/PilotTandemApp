import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/BottomNav';

export default async function PilotLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // First-run: if pilot profile is incomplete, send to /settings (except on /settings itself).
  const { data: pilot } = await supabase
    .from('pilots')
    .select('id, full_name, iban, primary_company_name')
    .eq('id', user.id)
    .maybeSingle();

  // Note: we can't read the current pathname server-side here without headers; do the check client-side on home.

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="bg-bg-dark text-white px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-display font-semibold">TandemLog</Link>
        <span className="text-xs text-white/70">{pilot?.full_name ?? user.email}</span>
      </header>
      <main className="flex-1 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
