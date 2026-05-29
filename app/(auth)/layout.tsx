import { Plane } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-bg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-bg-dark text-white">
              <Plane className="w-5 h-5 -rotate-45" />
            </span>
            <span className="text-2xl font-display font-bold tracking-tight">TandemLog</span>
          </div>
          <p className="text-text-muted text-sm mt-2">Flugrapport für Tandempiloten</p>
        </div>
        {children}
      </div>
    </main>
  );
}
