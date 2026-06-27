'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { setSeasonOverride } from '@/app/(pilot)/seasonActions';

const LABEL: Record<string, string> = { summer: 'Sommerzeit', winter: 'Winterzeit' };

/**
 * Shown when the pilot has forced a season that differs from the office/admin
 * setting. Offers a one-tap switch to follow the office (clears the override).
 */
export function SeasonNoticeBanner({
  pilotSeason, officeSeason,
}: {
  pilotSeason: 'summer' | 'winter';
  officeSeason: 'summer' | 'winter';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function adopt() {
    startTransition(async () => {
      await setSeasonOverride('auto');
      router.refresh();
    });
  }

  return (
    <div className="card p-3 border-l-4 border-l-warning flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
      <div className="text-sm flex-1">
        <span className="font-medium">Abweichende Saison:</span>{' '}
        Du hast <span className="font-medium">{LABEL[pilotSeason]}</span> eingestellt, das Office nutzt
        aktuell <span className="font-medium">{LABEL[officeSeason]}</span>. Deine Trip-Zeiten können
        dadurch abweichen.
        <button
          type="button"
          onClick={adopt}
          disabled={pending}
          className="block mt-1 text-accent font-medium"
        >
          {pending ? 'Wird umgestellt…' : `Auf Office-Einstellung (${LABEL[officeSeason]}) wechseln`}
        </button>
      </div>
    </div>
  );
}
