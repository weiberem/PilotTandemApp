'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Camera, Check, Minus, Plus, X } from 'lucide-react';
import { bulkAddFlights, bulkAddFlightsByCount, applySumupCcTimes, applyCashPhotos } from '@/app/(pilot)/log/bulkActions';

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
  const sumupRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'review' | 'sumup' | 'cash'>('idle');
  const [sumupDate, setSumupDate] = useState<string | null>(null);
  const [sumupBusy, setSumupBusy] = useState(false);
  const [cashCount, setCashCount] = useState(0);
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

  async function onSumupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setMsg(null);
    setSumupBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''));
      const r = await fetch('/api/ai/extract-sumup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, media_type: file.type }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ kind: 'err', text: data.error === 'ai_not_configured'
          ? 'AI is not configured yet.' : 'Could not read the SumUp screenshot.' });
        setSumupBusy(false);
        return;
      }
      const payments: string[] = (data.transactions ?? [])
        .filter((t: { amount: number }) => Math.round(t.amount) === 40)
        .map((t: { time: string }) => t.time);
      if (payments.length === 0) {
        setMsg({ kind: 'err', text: 'No 40 CHF card photo payments found in the screenshot.' });
        setSumupBusy(false);
        return;
      }
      const res = await applySumupCcTimes({ flight_date: sumupDate ?? today, payment_times: payments });
      setSumupBusy(false);
      if (!res.ok) { setMsg({ kind: 'err', text: res.error }); return; }
      setMsg({ kind: 'ok', text: `${res.assigned} CC photo flight${res.assigned === 1 ? '' : 's'} timed from ${res.payments} payment${res.payments === 1 ? '' : 's'}.` });
    } catch {
      setMsg({ kind: 'err', text: 'Upload failed — please try again.' });
      setSumupBusy(false);
    }
  }

  function finishCash(n: number) {
    if (n <= 0) { setPhase('idle'); setSumupDate(null); setCashCount(0); return; }
    setMsg(null);
    startTransition(async () => {
      const res = await applyCashPhotos({ flight_date: sumupDate ?? today, count: n });
      if (!res.ok) { setMsg({ kind: 'err', text: res.error }); return; }
      setMsg({ kind: 'ok', text: `${res.assigned} cash photo${res.assigned === 1 ? '' : 's'} added.` });
      setPhase('idle'); setSumupDate(null); setCashCount(0);
    });
  }

  function onConfirm() {
    if (!extract) return;
    const wasCounts = countsMode;
    const dateUsed = extract.date ?? today;
    setMsg(null);
    startTransition(async () => {
      const r = wasCounts
        ? await bulkAddFlightsByCount({
            flight_date: dateUsed,
            flights_count: cFlights,
            photo_pp_count: cPp, double_air_count: cDouble, no_show_count: cNoShow,
            company,
          })
        : await bulkAddFlights({
            flight_date: dateUsed,
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
      setExtract(null);
      // Counts have no times — offer the optional SumUp step to time the CC
      // photo flights. Time-based captures already have times → done.
      if (wasCounts) { setSumupDate(dateUsed); setPhase('sumup'); }
      else { setPhase('idle'); }
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
          <Counter label="Photo prepaid" value={cPp} onChange={setCPp} max={flying} />
          <Counter label="Double air" value={cDouble} onChange={setCDouble} max={flying} />
        </div>

        <p className="text-[11px] text-text-muted">
          Prepaid = photos paid in advance. Card (CC) photos get their times from the SumUp step next.
        </p>
        <button onClick={onConfirm} disabled={pending || cFlights < 1} className="btn-primary w-full">
          <Check className="w-4 h-4 mr-2" />
          {pending ? 'Saving…' : `Confirm ${cFlights} flight${cFlights === 1 ? '' : 's'}`}
        </button>
        {msg && <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>}
      </div>
    );
  }

  if (phase === 'sumup') {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-semibold text-lg">Card photo times?</div>
            <div className="text-xs text-text-muted">
              Optional — upload your SumUp “Sales” screenshot and the 40 CHF card photos get matched
              to their flights’ times automatically.
            </div>
          </div>
          <button onClick={() => setPhase('cash')} className="p-1 text-text-muted" aria-label="Skip">
            <X className="w-5 h-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => sumupRef.current?.click()}
          disabled={sumupBusy}
          className="btn-primary w-full"
        >
          <Camera className="w-5 h-5 mr-2" />
          {sumupBusy ? 'Reading SumUp…' : 'Scan SumUp sales'}
        </button>
        <input ref={sumupRef} type="file" accept="image/*" onChange={onSumupFile} className="hidden" />
        <button
          type="button"
          onClick={() => setPhase('cash')}
          className="btn-ghost w-full border border-border text-sm"
        >
          {msg?.kind === 'ok' ? 'Next' : 'Skip SumUp'}
        </button>
        {msg && <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>}
      </div>
    );
  }

  if (phase === 'cash') {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-semibold text-lg">Cash photos?</div>
            <div className="text-xs text-text-muted">Any photos paid in cash today? Set the count, or tap “No”.</div>
          </div>
          <button onClick={() => finishCash(0)} className="p-1 text-text-muted" aria-label="No"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex justify-center">
          <Counter label="Cash photos" value={cashCount} onChange={setCashCount} max={20} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => finishCash(0)} disabled={pending} className="btn-ghost flex-1 border border-border">
            No cash photos
          </button>
          <button onClick={() => finishCash(cashCount)} disabled={pending || cashCount < 1} className="btn-primary flex-1">
            <Check className="w-4 h-4 mr-1" /> Add {cashCount > 0 ? cashCount : ''} cash
          </button>
        </div>
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
