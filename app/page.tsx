import Link from 'next/link';
import { Plane } from 'lucide-react';

/**
 * Static root page — no server-side auth probe, no Supabase calls.
 * Purely renders a welcome screen with a link to /login. This avoids
 * any failure path that could surface as a 404 on the root URL.
 *
 * Auth-protected pages still do their own auth.getUser() check.
 */
export default function Index() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-bg">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-bg-dark text-white">
              <Plane className="w-5 h-5 -rotate-45" />
            </span>
            <span className="text-3xl font-display font-bold tracking-tight">TandemLog</span>
          </div>
          <p className="text-text-muted text-sm mt-2">Flugrapport für Tandempiloten</p>
        </div>
        <div className="card p-6 space-y-3">
          <p className="text-sm text-text-muted">
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
