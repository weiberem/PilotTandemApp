import Link from 'next/link';

/**
 * Static root page — no server-side auth probe, no Supabase calls.
 * Purely renders a welcome screen with a link to /login. This avoids
 * any failure path that could surface as a 404 on the root URL.
 *
 * Auth-protected pages still do their own auth.getUser() check.
 */
export default function Index() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-gradient-to-b from-bg to-white">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-3xl font-display font-bold">
            <span className="text-primary">✈️</span>
            <span>TandemLog</span>
          </div>
          <p className="text-text-muted text-sm mt-2">Flight logger for tandem pilots</p>
        </div>
        <div className="card p-6 space-y-4">
          <p className="text-sm">
            Willkommen. Melde dich an, um deine Flüge zu erfassen oder die Monatsabrechnung zu öffnen.
          </p>
          <Link href="/login" className="btn-primary w-full">Anmelden</Link>
          <Link href="/register" className="btn-ghost w-full border border-border">
            Einladung einlösen
          </Link>
        </div>
      </div>
    </main>
  );
}
