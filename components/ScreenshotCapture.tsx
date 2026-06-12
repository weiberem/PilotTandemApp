'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Camera, Check, Minus, Plus, X } from 'lucide-react';
import { bulkAddFlights, bulkAddFlightsByCount } from '@/app/(pilot)/log/bulkActions';

type Extract = {
  date: string | null;
  trip_times: string[];
  count: number;
  flights_count: number | null;
  photo_count: number | null;
  double_air_count: number | null;
  no_show_count: number | null;
  confidence: 'high' | 'medium' | 'low';
};

type Props = { today: string; company: string };

/**
 * Simplified end-of-day capture: upload the WhatsApp/daysheet screenshot,
 * AI counts the flights, pilot sets photo counters and confirms.
 * Enabled per pilot via Settings → "Simplified day capture".
 */
export function ScreenshotCapture({ today, company }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'review'>('idle');
  const [extract, setExtract] = useState<Extract | null>(null);
  const [pp, setPp] = useState(0);
  const [cc, setCc] = useState(0);
  const [cash, setCash] = useState(0);
  // Counts-summary mode (daysheet has totals, no times): editable per-day totals.
  const [cFlights, setCFlights] = useState(0);
  const [cPp, setCPp] = useState(0);
  const [cDouble, setCDouble] = useState(0);
  const [cNoShow, setCNoShow] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setMsg(null);
    setPhase('scanning');
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''));
      const r = await fetch('/api/ai/extract-flights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, media_type: file.type }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ kind: 'err', text: data.error === 'ai_not_configured'
          ? 'AI capture is not configured yet — ask the admin to set the API key.'
          : 'Could not read the screenshot. Try a clearer photo or log flights manually.' });
        setPhase('idle');
        return;
      }
      const hasTimes = data.count > 0;
      const hasCounts = (data.flights_count ?? 0) > 0;
      if (!hasTimes && !hasCounts) {
        setMsg({ kind: 'err', text: 'No flights found in the screenshot. Try another image or log manually.' });
        setPhase('idle');
        return;
      }
      setExtract(data);
      if (hasTimes) {
        setPp(0); setCc(0); setCash(0);
      } else {
        setCFlights(data.flights_count ?? 0);
        setCPp(data.photo_count ?? 0);
        setCDouble(data.double_air_count ?? 0);
        setCNoShow(data.no_show_count ?? 0);
      }
      setPhase('review');
    } catch {
      setMsg({ kind: 'err', text: 'Upload failed — please try again.' });
      setPhase('idle');
    }
  }

  const countsMode = !!extract && extract.trip_times.length === 0;

  function onConfirm() {
    if (!extract) return;
    setMsg(null);
    startTransition(async () => {
      const r = countsMode
        ? await bulkAddFlightsByCount({
            flight_date: extract.date ?? today,
            flights_count: cFlights,
            photo_pp_count: cPp, double_air_count: cDouble, no_show_count: cNoShow,
            company,
          })
        : await bulkAddFlights({
            flight_date: extract.date ?? today,
            trip_times: extract.trip_times,
            pp_count: pp, cc_count: cc, cash_count: cash,
            company,
          });
      if (!r.ok) { setMsg({ kind: 'err', text: r.error }); return; }
      const skipped = 'skipped' in r ? r.skipped : 0;
      setMsg({
        kind: 'ok',
        text: `${r.inserted} flights logged${skipped ? ` (${skipped} already existed)` : ''}.`,
      });
      setPhase('idle');
      setExtract(null);
    });
  }

  if (phase === 'review' && extract && countsMode) {
    const flying = Math.max(0, cFlights - cNoShow);
    return (
      <div className="card p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-semibold text-lg">Daysheet totals</div>
            <div className="text-xs text-text-muted">
              {(extract.date ?? today).split('-').reverse().join('.')} · added without times — fill in later or from a SumUp upload
              {extract.confidence !== 'high' && (
                <span className="text-warning ml-1">· please double-check</span>
              )}
            </div>
          </div>
          <button onClick={() => { setPhase('idle'); setExtract(null); }} className="p-1 text-text-muted" aria-label="Cancel">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Counter label="Flights" value={cFlights} onChange={setCFlights} max={30} />
          <Counter label="No show" value={cNoShow} onChange={setCNoShow} max={cFlights} />
          <Counter label="Photo (PP)" value={cPp} onChange={setCPp} max={flying} />
          <Counter label="Double air" value={cDouble} onChange={setCDouble} max={flying} />
        </div>

        <button onClick={onConfirm} disabled={pending || cFlights < 1} className="btn-primary w-full">
          <Check className="w-4 h-4 mr-2" />
          {pending ? 'Saving…' : `Confirm ${cFlights} flight${cFlights === 1 ? '' : 's'}`}
        </button>
        {msg && <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>}
      </div>
    );
  }

  if (phase === 'review' && extract) {
    return (
      <div className="card p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-semibold text-lg">
              {extract.count} flight{extract.count === 1 ? '' : 's'} found
            </div>
            <div className="text-xs text-text-muted">
              {(extract.date ?? today).split('-').reverse().join('.')} · {extract.trip_times.join(' · ')}
              {extract.confidence !== 'high' && (
                <span className="text-warning ml-1">· please double-check</span>
              )}
            </div>
          </div>
          <button onClick={() => { setPhase('idle'); setExtract(null); }} className="p-1 text-text-muted" aria-label="Cancel">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Counter label="Photo PP" value={pp} onChange={setPp} max={extract.count - cc - cash} />
          <Counter label="Photo CC" value={cc} onChange={setCc} max={extract.count - pp - cash} />
          <Counter label="Photo Cash" value={cash} onChange={setCash} max={extract.count - pp - cc} />
        </div>

        <button onClick={onConfirm} disabled={pending} className="btn-primary w-full">
          <Check className="w-4 h-4 mr-2" />
          {pending ? 'Saving…' : `Confirm ${extract.count} flights`}
        </button>
        {msg && <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={phase === 'scanning'}
        className="btn-primary w-full"
      >
        <Camera className="w-5 h-5 mr-2" />
        {phase === 'scanning' ? 'Reading screenshot…' : 'Scan daysheet screenshot'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <p className="text-xs text-text-muted text-center">
        Upload the end-of-day WhatsApp screenshot — flights are counted automatically.
        {' '}<Link href="/log" className="text-primary hover:underline">Log manually instead</Link>
      </p>
      {msg && <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>}
    </div>
  );
}

function Counter({
  label, value, onChange, max,
}: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div className="rounded-lg border border-border p-2 text-center space-y-1">
      <div className="text-xs font-medium text-text-muted">{label}</div>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button" onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 rounded-full border border-border inline-flex items-center justify-center"
          aria-label={`${label} minus`}
        ><Minus className="w-4 h-4" /></button>
        <span className="font-mono text-lg w-6">{value}</span>
        <button
          type="button" onClick={() => onChange(Math.min(max, value + 1))}
          className="w-8 h-8 rounded-full border border-border inline-flex items-center justify-center"
          aria-label={`${label} plus`}
        ><Plus className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
