export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-gradient-to-b from-bg to-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-2xl font-display font-bold">
            <span className="text-primary">✈️</span>
            <span>TandemLog</span>
          </div>
          <p className="text-text-muted text-sm mt-1">Flight logger for tandem pilots</p>
        </div>
        {children}
      </div>
    </main>
  );
}
