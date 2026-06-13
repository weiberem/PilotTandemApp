'use client';

import { useCallback, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

/**
 * Per-page guided tour. Renders a floating "?" button (bottom-right, above the
 * bottom nav) that starts the tour for the current page. With `autoStartKey`
 * the tour also runs once automatically on the first visit (tracked in
 * localStorage) and can be forced again via the `?tour=1` query param.
 */
export function PageTour({
  steps,
  autoStartKey,
}: {
  steps: DriveStep[];
  autoStartKey?: string;
}) {
  const run = useCallback(() => {
    const d = driver({
      showProgress: steps.length > 1,
      allowClose: true,
      nextBtnText: 'Weiter',
      prevBtnText: 'Zurück',
      doneBtnText: 'Fertig',
      progressText: '{{current}} / {{total}}',
      steps,
    });
    d.drive();
  }, [steps]);

  useEffect(() => {
    if (!autoStartKey) return;
    const forced = new URLSearchParams(window.location.search).get('tour') === '1';
    if (!forced && localStorage.getItem(autoStartKey)) return;
    const t = window.setTimeout(() => {
      try { localStorage.setItem(autoStartKey, '1'); } catch { /* ignore */ }
      run();
    }, 450);
    return () => window.clearTimeout(t);
  }, [autoStartKey, run]);

  return (
    <button
      type="button"
      onClick={run}
      aria-label="Hilfe — Tour starten"
      title="Tour für diese Seite"
      className="fixed right-4 bottom-20 z-40 w-11 h-11 rounded-full bg-white border border-border shadow-lg flex items-center justify-center text-primary active:scale-95 hover:bg-bg-subtle"
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  );
}
