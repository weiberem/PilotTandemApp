'use client';

import { useRef, useState } from 'react';
import { Camera, Share2 } from 'lucide-react';
import { DaySummaryCard } from './DaySummaryCard';
import type { DayTotals, PilotRates } from '@/lib/flights';

type Props = {
  pilotName: string;
  date: string;
  totals: DayTotals;
  rates: PilotRates;
};

export function SummaryActions(props: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'snap' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function snapshot(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: '#ffffff',
      scale: Math.min(window.devicePixelRatio * 2, 4),
      useCORS: true,
    });
    return await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
  }

  async function onScreenshot() {
    setError(null);
    setBusy('snap');
    try {
      const blob = await snapshot();
      if (!blob) throw new Error('Screenshot failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tandemlog-${props.date}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setError(null);
    setBusy('share');
    try {
      const blob = await snapshot();
      if (!blob) throw new Error('Screenshot failed');
      const file = new File([blob], `tandemlog-${props.date}.png`, { type: 'image/png' });
      // Web Share API Level 2 — files support
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({
          files: [file],
          title: `TandemLog ${props.date}`,
          text: `${props.pilotName} — ${props.date}`,
        });
      } else {
        // Fallback: download.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tandemlog-${props.date}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <DaySummaryCard ref={cardRef} {...props} />
      <div className="flex gap-2 max-w-sm mx-auto w-full">
        <button onClick={onScreenshot} disabled={!!busy} className="btn-ghost flex-1 border border-border">
          <Camera className="w-4 h-4 mr-2" /> {busy === 'snap' ? '…' : 'Screenshot'}
        </button>
        <button onClick={onShare} disabled={!!busy} className="btn-primary flex-1">
          <Share2 className="w-4 h-4 mr-2" /> {busy === 'share' ? '…' : 'Share'}
        </button>
      </div>
      {error && <p className="text-danger text-sm text-center">{error}</p>}
    </>
  );
}
