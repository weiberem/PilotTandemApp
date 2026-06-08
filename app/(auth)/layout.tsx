import Link from 'next/link';
import { Plane } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col bg-bg">
      <section className="bg-bg-dark text-white px-6 pt-12 pb-10 text-center">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-white">
            <Plane className="w-5 h-5 -rotate-45" />
          </span>
          <span className="text-2xl font-display font-bold tracking-tight">
            Tandem<span className="text-primary">Log</span>
          </span>
        </Link>
        <p className="text-white/70 text-xs mt-2">Flight reporting for tandem pilots</p>
      </section>

      <section className="flex-1 flex items-start justify-center p-4 -mt-6">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
