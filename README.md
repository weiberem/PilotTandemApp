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
- [x] 9. Google Drive OAuth + Einsatzplan sync (offline access, lenient parser)
- [x] 10. Invoice XLSX generation (exceljs, exact template match)
- [x] 11. Invoice PDF generation (@react-pdf/renderer)
- [x] 12. Invoice desktop view + send flow (Resend, GDrive upload, auto invoice nr)
- [x] 13. Statistics dashboard (monthly chart, year table, VKPI card, other companies)
- [x] 14. Admin panel (invite/deactivate via service-role; pilot data stays inaccessible)
- [x] 15. PWA shell (manifest, icons, next-pwa wired)
- [x] 16. Monthly invoice cron (vercel cron, drafts + email)
- [x] 17. Vercel deployment (vercel.json with cron + maxDuration; auto-deploy on push)

## Deployment checklist

To take a fresh deploy live you need:

1. **Supabase** — apply `supabase/migrations/001_initial_schema.sql` in the SQL editor.
2. **Vercel env vars** (Project Settings → Environment Variables, all envs):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`  *(secret)*
   - `RESEND_API_KEY`             *(secret)*
   - `RESEND_FROM_EMAIL`          (e.g. `TandemLog <onboarding@resend.dev>`)
   - `GOOGLE_CLIENT_ID`           *(OAuth client, "Web application")*
   - `GOOGLE_CLIENT_SECRET`       *(secret)*
   - `GOOGLE_REDIRECT_URI`        (e.g. `https://yourdomain.vercel.app/api/gdrive/callback`)
   - `CRON_SECRET`                *(random string; Vercel cron sets `authorization: Bearer ${CRON_SECRET}` when this is set)*
   - `NEXT_PUBLIC_APP_URL`        (e.g. `https://yourdomain.vercel.app`)
3. **Google Cloud** — enable Drive API, create OAuth consent screen, add the
   Vercel callback URL above to the authorised redirect URIs.
4. **Admin bootstrap** — insert your own user id into the `admins` table once
   (via SQL editor) so you can access `/admin`:
   `insert into admins (id) values ('<your-auth-user-id>');`
5. **Cron** — `vercel.json` already declares the monthly cron at
   `0 6 1 * *` (07:00 CET on the 1st). Vercel will pick it up on the next
   deploy.

## Tests

```
npm test
```

Currently covers `lib/tripTimes.ts`.
