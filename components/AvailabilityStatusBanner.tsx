import { AlertTriangle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeadlineInfo } from '@/lib/availability';

/**
 * Status banner shown above the calendar in "My availability" mode.
 *
 * - submitted → green confirmation for the viewed month
 * - otherwise → the next submission deadline, with a day countdown and an
 *   amber/urgent treatment when it's close.
 */
export function AvailabilityStatusBanner({
  submitted, viewedMonthLabel, deadline,
}: {
  submitted: boolean;
  viewedMonthLabel: string;
  deadline: DeadlineInfo;
}) {
  if (submitted) {
    return (
      <div className="card p-3 border-l-4 border-l-success text-sm flex items-start gap-2">
        <Check className="w-4 h-4 shrink-0 mt-0.5 text-success" />
        <span>
          Submitted to Skywings for <span className="font-semibold capitalize">{viewedMonthLabel}</span>{' '}
          (shown hatched). Tap a day if you still need to edit.
        </span>
      </div>
    );
  }

  const countdown =
    deadline.daysLeft > 0 ? `in ${deadline.daysLeft} day${deadline.daysLeft === 1 ? '' : 's'}`
    : deadline.daysLeft === 0 ? 'today'
    : 'overdue';

  return (
    <div className={cn(
      'card p-3 border-l-4 text-sm flex items-start gap-2',
      deadline.urgent ? 'border-l-warning' : 'border-l-primary',
    )}>
      <AlertTriangle className={cn('w-4 h-4 shrink-0 mt-0.5', deadline.urgent ? 'text-warning' : 'text-primary')} />
      <span>
        Submit availability for <span className="font-semibold capitalize">{deadline.targetMonthLabel}</span>{' '}
        by <span className="font-semibold">{deadline.deadlineMonthLabel} {deadline.deadlineDay}</span>
        {' '}({countdown}).
      </span>
    </div>
  );
}
