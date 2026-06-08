import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: isAdminRow } = await supabase.from('admins').select('id').eq('id', user.id).maybeSingle();
  if (!isAdminRow) redirect('/home');

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="bg-bg-dark text-white px-4 py-3 flex items-center justify-between">
        <Link href="/admin" className="font-display font-semibold">TandemLog Admin</Link>
        <Link href="/home" className="text-xs text-white/70">To pilot app</Link>
      </header>
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  );
}
