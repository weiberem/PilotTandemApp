import Link from 'next/link';
import { AlertCircle, Wind } from 'lucide-react';
import { formatChf } from '@/lib/utils';
import { PhotoStatusSwitch } from './PhotoStatusSwitch';
import type { FlightRow } from '@/lib/flights';

export function FlightLine({ flight, indent = 'pl-10' }: { flight: FlightRow; indent?: string }) {
  const tip = Number(flight.tip_chf ?? 0);
  return (
    <div className={`flex items-center gap-3 p-3 ${indent} flex-wrap`}>
      <span className="font-mono text-sm tabular-nums w-12">{flight.trip_time}</span>
      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark">
        {flight.company}
      </span>
      <PhotoStatusSwitch flightId={flight.id} current={flight.photo_status} disabled={flight.is_no_show} />
      {flight.is_no_show && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning inline-flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> No-Show
        </span>
      )}
      {flight.is_double_airtime && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent inline-flex items-center gap-1">
          <Wind className="w-3 h-3" /> Thermal
        </span>
      )}
      <div className="flex-1" />
      {tip > 0 && <span className="font-mono text-xs text-text-muted">{formatChf(tip)}</span>}
      <Link href={`/log/${flight.id}/edit`} className="text-xs text-primary hover:underline">
        edit
      </Link>
    </div>
  );
}
