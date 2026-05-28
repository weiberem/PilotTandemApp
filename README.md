# TandemLog

Full-stack flight logger and invoicing app for tandem paragliding pilots, built with
Next.js 14 (App Router), Supabase, and Tailwind/shadcn.

Two surfaces:

- **Mobile PWA** — daily flight logging
- **Desktop dashboard** — monthly invoicing & annual stats

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - Supabase URL, anon key, service-role key
   - Google OAuth client + redirect (for Drive sync)
   - Resend API key (for invoice email)
   - `CRON_SECRET` for protecting `/api/cron/*` routes
2. Apply the SQL migration in `supabase/migrations/001_initial_schema.sql`
   via the Supabase SQL Editor (Dashboard → SQL → New query → paste → Run).
3. Install + run:
   ```
   npm install
   npm run dev
   ```
   Open <http://localhost:3000>.

## Architecture

- **Multi-tenant**: every data row has a `pilot_id`; RLS enforces
  `pilot_id = auth.uid()` on `flights`, `availability_submissions`, `invoices`,
  and the `pilots` profile row.
- **Admins** live in a separate `admins` table and have no read access to any
  pilot's data via RLS. Admin-only actions use server routes with the
  service-role key.

## Project layout

See `app/`, `components/`, `lib/`, `supabase/migrations/`.
The trip times for Skywings (summer / winter, optional 07:10 + 17:00) live in
`lib/tripTimes.ts` — these values are exact and non-negotiable.

## Implementation status

Tracking the 17-step plan from PROMPT.md.
- [x] 1. Supabase schema + RLS migration
- [x] 2. Auth (login, register-via-invite, middleware-guarded routes)
- [x] 3. Pilot settings form
- [x] 4. Trip times + season logic (+ unit tests)
- [x] 5. Flight entry form (smart pre-fill, no-show invariants, company picker)
- [x] 6. Today's flight list (edit, swipe-to-delete)
- [x] 7. End-of-day summary (receipt card, screenshot + native share)
- [x] 8. Availability calendar (month grid, day cycle + long-press sheet, mailto)
- [ ] 9. Google Drive OAuth + Einsatzplan sync
- [ ] 10. Invoice XLSX generation
- [ ] 11. Invoice PDF generation
- [ ] 12. Invoice desktop view + send flow
- [ ] 13. Statistics dashboard
- [ ] 14. Admin panel
- [x] 15. PWA shell (manifest, icons, next-pwa wired)
- [ ] 16. Monthly invoice cron
- [ ] 17. Vercel deployment

## Tests

```
npm test
```

Currently covers `lib/tripTimes.ts`.
