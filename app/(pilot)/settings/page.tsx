import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: { searchParams: { welcome?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase.from('pilots').select('*').eq('id', user.id).maybeSingle();

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      {searchParams.welcome && (
        <div className="card p-4 border-l-4 border-l-accent">
          <h2 className="font-display font-semibold">Willkommen bei TandemLog!</h2>
          <p className="text-sm text-text-muted">
            Bitte vervollständige zuerst dein Profil. Pflichtfelder: Name und IBAN.
          </p>
        </div>
      )}
      <h1 className="text-2xl font-display font-bold">Einstellungen</h1>
      <SettingsForm pilot={pilot} email={user.email ?? ''} />
    </div>
  );
}
