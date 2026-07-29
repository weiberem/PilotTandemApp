'use client';

import { useState } from 'react';
import { TAKEOFF_SITES, LANDING_SITES, LANDING_CUSTOM } from '@/lib/sites';

type SiteValue = { takeoff: string | null; landing: string | null };

/**
 * Takeoff + landing site selects. Choosing "Aussenlandung" for the landing
 * reveals a free-text field; the typed spot becomes the stored landing value.
 * Self-contained: emits the resolved values via onChange on every change.
 */
export function SitePicker({
  takeoff, landing, onChange,
}: SiteValue & { onChange: (v: SiteValue) => void }) {
  const landingIsPreset = landing === 'Höhenmatte' || landing === 'Lehn';
  const [takeoffSel, setTakeoffSel] = useState(takeoff ?? '');
  const [landingSel, setLandingSel] = useState(
    landing ? (landingIsPreset ? landing : LANDING_CUSTOM) : '',
  );
  const [custom, setCustom] = useState(
    landing && !landingIsPreset && landing !== LANDING_CUSTOM ? landing : '',
  );

  function emit(t: string, sel: string, c: string) {
    const landingVal = sel === LANDING_CUSTOM ? (c.trim() || LANDING_CUSTOM) : (sel || null);
    onChange({ takeoff: t || null, landing: landingVal });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="text-text-muted block mb-1">Startplatz</span>
          <select
            value={takeoffSel}
            onChange={e => { setTakeoffSel(e.target.value); emit(e.target.value, landingSel, custom); }}
            className="w-full min-h-tap rounded-lg border border-border px-2 py-1.5 bg-white text-sm"
          >
            <option value="">—</option>
            {TAKEOFF_SITES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-text-muted block mb-1">Landeplatz</span>
          <select
            value={landingSel}
            onChange={e => { setLandingSel(e.target.value); emit(takeoffSel, e.target.value, custom); }}
            className="w-full min-h-tap rounded-lg border border-border px-2 py-1.5 bg-white text-sm"
          >
            <option value="">—</option>
            {LANDING_SITES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {landingSel === LANDING_CUSTOM && (
        <input
          type="text"
          value={custom}
          onChange={e => { setCustom(e.target.value); emit(takeoffSel, landingSel, e.target.value); }}
          placeholder="Aussenlandung – Ort eingeben"
          className="w-full min-h-tap rounded-lg border border-border px-3 py-1.5 bg-white text-sm"
        />
      )}
    </div>
  );
}
