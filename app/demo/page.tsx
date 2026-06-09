import Link from 'next/link';
import { Plane, Check, ShieldOff } from 'lucide-react';

export const metadata = { title: 'TandemLog Demo' };

export default function DemoLanding() {
  return (
    <main className="min-h-dvh flex flex-col bg-bg">
      <section className="bg-bg-dark text-white px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-3 mb-6">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-primary text-white shadow-md">
            <Plane className="w-6 h-6 -rotate-45" />
          </span>
          <span className="text-4xl font-display font-bold tracking-tight">
            Tandem<span className="text-primary">Log</span>
          </span>
        </div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Demo account with sample data
        </h1>
        <p className="text-white/70 text-sm mt-3 max-w-md mx-auto">
          Click the button and you're in instantly — no registration,
          no email confirmation. Cleans itself up automatically after 24 hours.
        </p>
      </section>

      <section className="flex-1 flex items-start justify-center p-4 -mt-6">
        <div className="card p-6 space-y-4 w-full max-w-sm">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
              <span>Previous month complete with invoice sent</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
              <span>Current month with some days verified</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
              <span>Sample schedule on the calendar</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldOff className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <span>Invoice sending is simulated — no real email sent</span>
            </li>
          </ul>

          <form action="/api/demo/start" method="POST">
            <button type="submit" className="btn-primary w-full">
              <Plane className="w-4 h-4 mr-2 -rotate-45" /> Start demo
            </button>
          </form>

          <p className="text-xs text-text-muted text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">Sign In</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
