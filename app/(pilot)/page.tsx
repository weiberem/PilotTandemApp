import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatDateDe, isoDate, formatChf } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase.from('pilots').select('*').eq('id', user.id).maybeSingle();
  // First-run: settings incomplete → go to /settings
  if (!pilot || !pilot.full_name || !pilot.iban) {
    redirect('/settings?welcome=1');
  }

  const today = isoDate();
  const { data: flights } = await supabase
    .from('flights')
    .select('id, photo_status, is_no_show, is_double_airtime, tip_chf')
    .eq('flight_date', today)
    .order('trip_time');

  const list = flights ?? [];
  const totalFlights = list.filter(f => !f.is_no_show).length;
  const totalPhoto = list.filter(f => f.photo_status === 'PP').length;
  const totalNoShow = list.filter(f => f.is_no_show).length;
  const totalTip = list.reduce((sum, f) => sum + Number(f.tip_chf ?? 0), 0);

  return (
    <div className="p-4 space-y-4">
      <section>
        <p className="text-text-muted text-sm">{formatDateDe(new Date())}</p>
        <h1 className="text-2xl font-display font-bold">Heute</h1>
      </section>

      <Link href="/log" className="btn-accent w-full text-base shadow-md">
        ✈️ Flug erfassen
      </Link>

      <section className="card p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-2xl font-mono font-semibold">{totalFlights}</div>
            <div className="text-xs text-text-muted">Flüge</div>
          </div>
          <div>
            <div className="text-2xl font-mono font-semibold">{totalPhoto}</div>
            <div className="text-xs text-text-muted">PP</div>
          </div>
          <div>
            <div className="text-2xl font-mono font-semibold">{totalNoShow}</div>
            <div className="text-xs text-text-muted">No-Show</div>
          </div>
          <div>
            <div className="text-2xl font-mono font-semibold">{formatChf(totalTip)}</div>
            <div className="text-xs text-text-muted">Trinkgeld</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Link href="/today" className="btn-ghost flex-1 border border-border">Heutige Flüge</Link>
          <Link href="/summary" className="btn-primary flex-1">Tagesabschluss</Link>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">Einsatzplan</div>
            <div className="text-xs text-text-muted truncate">
              {pilot.einsatzplan_synced_at
                ? `Zuletzt importiert: ${formatDateDe(pilot.einsatzplan_synced_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                : pilot.google_refresh_token ? 'Bereit für Import' : 'Noch nicht verbunden'}
            </div>
          </div>
          <Link href="/einsatzplan" className="btn-ghost border border-border text-sm">
            {pilot.einsatzplan_synced_at ? 'Neuer Monat' : pilot.google_refresh_token ? 'Importieren' : 'Verbinden'}
          </Link>
        </div>
      </section>
    </div>
  );
}
