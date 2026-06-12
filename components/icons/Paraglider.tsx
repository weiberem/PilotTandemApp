import type { SVGProps } from 'react';

/**
 * Paraglider glyph in the lucide stroke style (24×24, currentColor, round
 * caps) — a crescent canopy with suspension lines down to the pilot.
 */
export function Paraglider({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* canopy (crescent wing) */}
      <path d="M2 8c2.5-3.6 17.5-3.6 20 0" />
      <path d="M2 8c3 1.7 17 1.7 20 0" />
      {/* suspension lines */}
      <path d="M5 8.6 11.4 15.4" />
      <path d="M19 8.6 12.6 15.4" />
      {/* pilot */}
      <circle cx="12" cy="18" r="2" />
    </svg>
  );
}
