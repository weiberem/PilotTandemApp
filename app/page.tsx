import Link from 'next/link';
import { Plane } from 'lucide-react';

/**
 * Static root page — no server-side auth probe, no Supabase calls.
 * Renders a welcome screen with a Skywings-style navy hero block on top
 * and a light card with CTAs below.
 */
export default function Index() {
  return (
    <main className="min-h-dvh flex flex-col bg-bg">
      <section className="bg-bg-dark text-white px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-3 mb-6">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-primary text-white shadow-md">
            <Plane className="w-6 h-6 -rotate-45" />
          </span>
          <span className="text-4xl font-display font-bold tracking-tight">
            Tendem<span className="text-primary">Log</span>
          </span>
        </div>
        <p className="text-white/70 text-sm italic">for tendempilots only</p>
        <h1 className="text-2xl font-display font-bold tracking-tight mt-6">
          Flight reporting for tandem pilots
        </h1>
        <p className="text-white/70 text-sm mt-3 max-w-sm mx-auto">
          Log flights, plan availability, send invoices.
        </p>
      </section>

      <section className="flex-1 flex items-start justify-center p-4 -mt-6">
        <div className="card p-6 space-y-3 w-full max-w-sm">
          <Link href="/login" className="btn-primary w-full">Sign In</Link>
          <Link href="/register" className="btn-ghost w-full border border-border">
            Redeem invitation
          </Link>
          <div className="border-t border-border pt-3">
            <Link
              href="/demo"
              className="block text-center text-sm text-primary font-medium hover:underline"
            >
              Try the demo →
            </Link>
            <p className="text-[11px] text-text-muted text-center mt-1">
              With sample data, no sign-up. Cleans up after 24h.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
