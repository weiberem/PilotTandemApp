'use client';

import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

// Bump the suffix to re-show the tour to everyone after a big UI change.
const TOUR_KEY = 'tandemlog_tour_v1';

/**
 * One-time spotlight tour shown on the first /home visit after onboarding.
 * Highlights the real UI (capture, day nav, summary, Invoice/Settings tabs).
 * Re-runnable via /home?tour=1 (e.g. a "Replay" link in Settings).
 */
export function IntroTour() {
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get('tour') === '1';
    if (!forced && localStorage.getItem(TOUR_KEY)) return;

    const t = window.setTimeout(() => {
      const d = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: 'Weiter',
        prevBtnText: 'Zurück',
        doneBtnText: 'Fertig',
        progressText: '{{current}} / {{total}}',
        steps: [
          {
            popover: {
              title: 'Willkommen bei TandemLog 🪂',
              description: 'Kurze Tour durch die wichtigsten Funktionen — dauert nur 30 Sekunden. Du kannst jederzeit mit Esc abbrechen.',
            },
          },
          {
            element: '[data-tour="capture"]',
            popover: {
              title: 'Tag erfassen',
              description: 'Scanne hier den Daysheet-Screenshot — die Flüge werden automatisch gezählt. Danach kommen SumUp (Karte) und Cash-Fotos.',
            },
          },
          {
            element: '[data-tour="daynav"]',
            popover: {
              title: 'Datum & Reset',
              description: 'Blättere mit den Pfeilen oder tippe aufs Datum, um einen anderen Tag zu erfassen. „Reset" löscht alle Flüge des Tages.',
            },
          },
          {
            element: '[data-tour="summary"]',
            popover: {
              title: 'Tagesübersicht',
              description: 'Dein Umsatz für den Tag. Über „Day Summary" und „Month overview" siehst du Details und verifizierst die Tage.',
            },
          },
          {
            element: '[data-tour="nav-invoice"]',
            popover: {
              title: 'Rechnung & Statistik',
              description: 'Monatsabrechnung ans Office senden und deine Jahres-Statistik ansehen. Nicht verifizierte Monate führen dich mit einem Tipp zur Übersicht.',
            },
          },
          {
            element: '[data-tour="nav-settings"]',
            popover: {
              title: 'Einstellungen',
              description: 'Tarife, E-Mail-Adressen, Google Drive und weitere Firmen. Hier kannst du diese Tour auch wieder starten.',
            },
          },
        ],
        onDestroyed: () => {
          try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ }
        },
      });
      d.drive();
    }, 450);

    return () => window.clearTimeout(t);
  }, []);

  return null;
}
