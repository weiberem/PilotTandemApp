# TandemLog — Komplette Projekt-Dokumentation

> **Single Source of Truth.** Alles was du brauchst um die App zu verstehen,
> aufzusetzen, zu debuggen oder neu zu deployen — in einer Datei.

---

## 1. Was ist TandemLog?

Eine **Web-App** für Tandem-Paragliding-Piloten. Läuft in jedem modernen Browser
auf Desktop und Mobile — **keine Installation nötig**, einfach URL aufrufen.

**Zwei Surfaces**, gleiche App:
- **Mobile** (iPhone/Android Browser): tägliche Flug-Erfassung im Cockpit
- **Desktop** (Browser): Monatsabrechnung + Jahres-Statistik

**Primärer Nutzer:** Rémy Weibel, fliegt für **Skywings Adventures GmbH, Ringgenberg**.
Multi-Tenant — weitere Piloten können vom Admin eingeladen werden, jeder sieht nur
seine eigenen Daten (RLS-erzwungen).

---

## 2. Was die App kann

### Mobile (täglicher Workflow)

| Route | Was | Warum |
|---|---|---|
| `/` | Statische Welcome-Seite mit Login-Button | Schnell auf Mobile aufrufbar |
| `/login` | E-Mail + Passwort Login | Auth |
| `/register` | Konto aktivieren (Einladungsflow) | Admin lädt ein → Pilot setzt Passwort |
| `/home` | Heute-Dashboard: heutige Flüge + Schnellzugriffe | Cockpit-Hauptansicht |
| `/log` | Flug erfassen mit Smart-Pre-Fill | Ein Tap nach jedem Flug |
| `/log/[id]/edit` | Flug bearbeiten | Tap auf Liste |
| `/today` | Chronologische Tagesliste + Swipe-to-Delete | Übersicht |
| `/summary` | Tagesabschluss als Bon-Layout | Screenshot fürs Desk |
| `/availability` | Monatskalender für Verfügbarkeits-Planung | Bis 15. abgeben |
| `/einsatzplan` | Skywings-Plan importieren mit Vorschau | Monatlich |
| `/settings` | Profil, Tarife, Drive-Verbindung | Einmal-Setup |

### Desktop (Monatsabschluss)

| Route | Was |
|---|---|
| `/dashboard/invoice` | Vorschau + Vergleich mit erfassten Flügen + Senden-Button |
| `/dashboard/stats` | Chart, Jahresdetail-Tabelle, VKPI-Kopierfeld |
| `/admin` | Admin-only: Piloten-Verwaltung |

### Automatisierungen

- **Monats-Cron**: 1. des Monats 07:00 CET → Draft-Rechnung pro Pilot + E-Mail "Bereit zur Kontrolle"
- **Backup-Excel**: gleiche Cron-Routine schreibt ein Excel mit allen Flügen
  im Hand-geführten Format in den Drive-Hauptordner, alte Backups
  werden gelöscht (nur letzte 2 Monate behalten)

---

## 3. Tech-Stack

| Layer | Technologie | Warum |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server Components + API Routes in einem |
| Sprache | TypeScript | Type Safety |
| UI | Tailwind CSS | Schnelle, konsistente Styles |
| Datenbank | Supabase Postgres | Auth + DB + RLS in einem |
| Auth | Supabase Auth | E-Mail/Passwort, gemanagt |
| Hosting | Vercel | Auto-Deploy bei jedem Git-Push |
| E-Mail | Resend | Einfache API für Rechnungs-Mail |
| Google Drive | Drive API v3 | OAuth pro Pilot, Datei-Upload |
| PDF | @react-pdf/renderer | Rechnungs-PDF server-side |
| XLSX | exceljs | Rechnungs- und Backup-Excel |
| Charts | Recharts | Jahres-Statistik Bar/Line |

**Kein PWA, keine Native-App.** Nur Browser.

---

## 4. Architektur

```
┌──────────────────────────────────────────────────┐
│  Browser (Mobile + Desktop)                      │
│  • Rendert Next.js Server + Client Components    │
│  • Supabase-Client für Login (im Browser)        │
└────────────────────┬─────────────────────────────┘
                     │ HTTPS
┌────────────────────▼─────────────────────────────┐
│  Vercel                                          │
│  • Serverless Functions für /api/*               │
│  • Server Components rendern Seiten              │
│  • Cron-Scheduler (vercel.json)                  │
└──┬────────────────────┬───────────────────┬──────┘
   │                    │                   │
   ▼                    ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Supabase     │  │ Google Drive │  │ Resend       │
│ • Postgres   │  │ • OAuth      │  │ • E-Mail-API │
│ • RLS        │  │ • Files API  │  │              │
│ • Auth       │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

**Datenfluss Beispiel — Flug erfassen:**
1. Pilot tippt im Browser auf "Eintragen"
2. Server Action ruft `supabase.from('flights').insert(...)` auf
3. Supabase prüft RLS-Policy (`pilot_id = auth.uid()`) → erlaubt
4. Row landet in `flights`-Tabelle
5. `revalidatePath('/today')` macht die Liste neu

**Datenfluss Beispiel — Rechnung senden:**
1. Pilot klickt im Browser "Rechnung senden"
2. `/api/invoice/send` läuft auf Vercel (Node-Runtime)
3. Lädt Flüge des Monats aus Supabase
4. Generiert PDF (react-pdf) + XLSX (exceljs)
5. Vergibt nächste Rechnungsnummer (atomar via Service-Role)
6. Refresht Google-Token, lädt PDF+XLSX in Drive `<root>/<YYYY>/<MM>/`
7. Schickt Mail via Resend mit beiden Anhängen
8. Schreibt `invoices`-Row mit status='sent'

---

## 5. Datenbank-Schema

5 Tabellen, alle mit RLS. Migration liegt in `supabase/migrations/`.

### `pilots`
Profil pro User. PK ist die `auth.users.id`.
- Stammdaten: `full_name`, `address_*`, `iban`, `vat_number`
- Tarife: `flight_rate_chf` (105), `photo_prepaid_rate_chf` (40),
  `thermal_rate_chf` (50), `no_show_rate_chf` (32)
- Firma: `primary_company_name` ("Skywings Adventures GmbH"),
  `primary_company_address`
- E-Mails: `office_email`, `personal_email`, `invoice_cc_email`
- Drive: `google_drive_folder_id` (Haupt-Ordner für Rechnungen),
  `einsatzplan_folder_id` (Skywings-Plan-Ordner),
  `google_refresh_token`
- Cache: `einsatzplan_schedule` (jsonb), `einsatzplan_synced_at`
- Counter: `invoice_counter_year`, `invoice_counter` (für YYYY-NNN)

### `flights`
Ein Flug pro Zeile.
- `flight_date` (date) + `trip_time` (text, "HH:MM")
- `company` (default 'Skywings')
- `photo_status`: none / PP / CC / C
- `is_no_show` (boolean), `is_double_airtime` (boolean)
- `tip_chf` (numeric), `notes` (text)
- CHECK: kein No-Show mit Photo oder Thermal gleichzeitig

### `availability_submissions`
Eine Zeile pro Pilot+Monat.
- `month` (date, 1. des Monats)
- `days` (jsonb): `[{date, period: "full"|"half_am"|"half_pm", exclude_7am, exclude_5pm}]`
- `submitted_at`, `email_sent`
- UNIQUE auf (pilot_id, month)

### `invoices`
Eine Zeile pro Pilot+Monat+Firma.
- `month`, `company`, `invoice_number` (z.B. "2025-001")
- `status`: 'draft' | 'sent'
- Totals: `total_chf`, `flights_count`, `pp_count`, etc.
- `pdf_url`, `xlsx_url` (Drive WebViewLinks)
- UNIQUE auf (pilot_id, month, company)

### `admins`
Eine Zeile pro Admin (PK = auth.users.id). Sehr klein.

### RLS-Policies
- `pilots`: jeder sieht/ändert nur eigene Zeile (`id = auth.uid()`)
- `flights`, `availability_submissions`, `invoices`: jeder CRUD auf eigene
  Zeilen (`pilot_id = auth.uid()`)
- `admins`: jeder Admin sieht nur sich selbst
- Service-Role-Key umgeht RLS — nur für Cron + Admin-Routes

---

## 6. Business-Rules (im Code verdrahtet)

| Regel | Wert | Wo |
|---|---|---|
| Tarif pro Flug | CHF 105 | `pilots.flight_rate_chf` |
| Foto Prepaid | + CHF 40 | `pilots.photo_prepaid_rate_chf` |
| Thermal / Double Airtime | + CHF 50 | `pilots.thermal_rate_chf` |
| No-Show (zählt NICHT als Flug) | CHF 32 | `pilots.no_show_rate_chf` |
| Photo CC / Cash | tracked, **keine** Fee | hardcoded in `lib/flights.ts` |
| MwSt (inkludiert) | 8.1% | `pilots.vat_rate` |
| Verfügbarkeit-Deadline | 15. des Monats | Banner ab 10. |
| Sommer-Saison (Trip Times) | April–Oktober | `lib/tripTimes.ts:detectSeason()` |
| Trinkgeld | erfasst, NIE fakturiert | nur in Tagesabschluss sichtbar |
| VKPI-Zählung | alle Nicht-No-Show, alle Firmen | `lib/stats.ts` |

### Trip Times (Skywings exakt)

```
Sommer: 07:10*  08:10  09:20  10:30  11:45  13:30  14:45  16:00  17:00*
                * optional (Pilot kann opt-out)

Winter: 08:30  09:45  11:00  12:15  13:45  15:00
```

Andere Firmen (AlpinAir / Twin Paragliding / Freitext): Zeit ist
freie Eingabe, nicht aus der Liste.

### Invoice-Layout (exakt Skywings-Vorlage)

```
[Pilot Name]                          Skywings Adventures GmbH
[Adresse]                             Brandstrasse 38, 3852 Ringgenberg
[PLZ Ort]

ABRECHNUNG                            Nr. 2025-001
Januar 2025                           28.05.2026

Datum | Flüge à 105 | F/V à 40 | Thermal à 50 | No Show à 32 | Betrag
01    |     3       |    1     |      —       |      —       |  355
...
Total |     N       |    N     |      N       |      N       | CHF X

                                      Betrag inklusive 8.1% MwSt.
                                      MwSt.-Nr.: CHE-…

Bankverbindung:                       Netto: …  MwSt: …
IBAN: CH…
```

---

## 7. Projekt-Struktur (wichtigste Dateien)

```
PilotTandemApp/
├── app/                          ← Next.js Routes
│   ├── page.tsx                  ← STATISCHE Welcome-Seite (/)
│   ├── layout.tsx                ← Root-Layout (html, fonts)
│   ├── globals.css               ← Tailwind + Design-Tokens
│   ├── (auth)/
│   │   ├── layout.tsx            ← Auth-Branding
│   │   ├── login/page.tsx        ← /login
│   │   └── register/page.tsx     ← /register (Einladung)
│   ├── (pilot)/
│   │   ├── layout.tsx            ← Bottom-Nav + Header + Auth-Check
│   │   ├── home/page.tsx         ← /home Dashboard
│   │   ├── log/page.tsx          ← /log Flug erfassen
│   │   ├── log/[id]/edit/page.tsx
│   │   ├── today/page.tsx        ← /today Liste
│   │   ├── summary/page.tsx      ← /summary Bon
│   │   ├── availability/page.tsx
│   │   ├── einsatzplan/page.tsx
│   │   ├── settings/page.tsx + SettingsForm.tsx
│   │   └── dashboard/
│   │       ├── invoice/page.tsx
│   │       └── stats/page.tsx
│   ├── admin/
│   │   ├── layout.tsx            ← Admin-Guard
│   │   └── page.tsx + AdminPilots.tsx
│   └── api/
│       ├── admin/pilots/route.ts
│       ├── backup/run/route.ts
│       ├── cron/monthly-invoice/route.ts
│       ├── einsatzplan/commit/route.ts
│       ├── gdrive/{auth/start,callback,disconnect,sync,parse-preview}/route.ts
│       └── invoice/{generate,send}/route.ts
├── components/                   ← Wiederverwendbare React-Komponenten
│   ├── BottomNav.tsx             ← Mobile Bottom-Bar mit Plus-Button
│   ├── FlightForm.tsx            ← Erfassen + Edit (gleiche Form)
│   ├── FlightListItem.tsx        ← Swipeable Row
│   ├── DaySummaryCard.tsx        ← Bon-Layout
│   ├── SummaryActions.tsx        ← Screenshot + Teilen
│   ├── AvailabilityCalendar.tsx
│   ├── InvoicePreview.tsx
│   ├── InvoiceComparisonView.tsx
│   ├── GoogleDriveConnect.tsx
│   ├── SyncButton.tsx
│   ├── BackupButton.tsx
│   ├── StatsCharts.tsx
│   ├── VkpiCard.tsx
│   └── DeleteFlightButton.tsx
├── lib/                          ← Pure Logik + Helper, gut testbar
│   ├── tripTimes.ts              ← Saison + Trip-Time Logik
│   ├── flights.ts                ← Zod-Schema + computeDayTotals
│   ├── availability.ts           ← Monatsgrid + mailto-Builder
│   ├── invoice.ts                ← buildInvoiceRows, VAT
│   ├── invoiceGenerator.ts       ← XLSX-Builder (exceljs)
│   ├── pdfGenerator.tsx          ← PDF-Builder (react-pdf)
│   ├── invoiceAssemble.ts        ← Lädt Flüge + baut Daten
│   ├── invoiceNumber.ts          ← Atomarer Counter
│   ├── stats.ts                  ← yearStats, VKPI
│   ├── googleDrive.ts            ← OAuth + Drive API
│   ├── einsatzplanParser.ts      ← Excel-Parser
│   ├── backupXlsx.ts             ← Hand-Layout-Backup
│   ├── runBackup.ts              ← Backup-Runner
│   ├── email.ts                  ← Resend-Client
│   ├── utils.ts                  ← formatChf, extractDriveId, etc.
│   ├── supabase/
│   │   ├── client.ts             ← Browser-Client
│   │   └── server.ts             ← Server + Service-Role
│   └── *.test.ts                 ← 44 Unit-Tests
├── supabase/migrations/
│   ├── 001_initial_schema.sql    ← Tabellen + RLS + Trigger
│   └── 002_einsatzplan_folder.sql ← Zusätzliche Drive-Felder
├── public/                       ← Statische Assets
├── vercel.json                   ← Cron-Schedule
├── next.config.js                ← Build-Config
├── package.json                  ← Dependencies
├── tsconfig.json
├── tailwind.config.ts
└── .env.local.example            ← Template für Env-Variablen
```

---

## 8. Environment Variables

Reihenfolge spiegelt was du wann brauchst:

### Pflicht für Login + Basis-Funktion

```bash
NEXT_PUBLIC_SUPABASE_URL=https://saletfmwcsqopvehimrv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=https://<deine-vercel-domain>
```

### Für Google Drive (Phase C)

```bash
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=https://<deine-vercel-domain>/api/gdrive/callback
```

### Für Rechnungs-Mails (Phase D)

```bash
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=TandemLog <onboarding@resend.dev>
```

### Für Cron (Phase E)

```bash
CRON_SECRET=<irgendein zufälliger String>
```

---

## 9. Setup-Anleitung — Schritt für Schritt mit Verifikation

> **Wichtigste Regel:** Nach jedem Schritt verifizieren bevor du weitermachst.
> Wenn etwas nicht klappt, **diesen Schritt** debuggen, nicht den nächsten anfangen.

### Phase 0 — Voraussetzungen

Du brauchst:
- [ ] Node.js 20+ und npm installiert
- [ ] Ein Supabase-Konto (free tier reicht)
- [ ] Ein GitHub-Account
- [ ] Ein Vercel-Account (free tier reicht)
- [ ] Ein Resend-Konto (free tier reicht, später)
- [ ] Google Cloud Account (später)

### Phase A — Lokal aufsetzen + verifizieren (15 Min)

**Ziel:** Beweisen dass der Code auf deiner Maschine läuft, bevor wir Vercel anfassen.

#### A.1 Repository klonen

```bash
git clone https://github.com/weiberem/PilotTandemApp.git tandemlog
cd tandemlog
npm install
```

✅ **Verifikation:** `npm install` läuft fehlerfrei durch (Warnungen sind ok).

#### A.2 Supabase-Migrationen anwenden

In Supabase Dashboard:
1. SQL Editor → New Query
2. Inhalt von `supabase/migrations/001_initial_schema.sql` einfügen → Run
3. Neue Query → Inhalt von `supabase/migrations/002_einsatzplan_folder.sql` → Run

✅ **Verifikation:** Im SQL Editor laufen lassen:
```sql
select count(*) from pilots;
select count(*) from flights;
```
Beide geben `0` zurück. Keine Fehlermeldung.

#### A.3 Env-Datei anlegen

Datei `.env.local` im Projekt-Root erstellen:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://saletfmwcsqopvehimrv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

✅ **Verifikation:** Datei existiert, hat die 4 Zeilen.

#### A.4 Dev-Server starten

```bash
npm run dev
```

✅ **Verifikation:** Terminal zeigt `Local: http://localhost:3000`. Keine roten Errors.

#### A.5 Welcome-Seite im Browser

Browser → `http://localhost:3000`

✅ **Verifikation:** "TandemLog ✈️" + "Willkommen…" + zwei Buttons sichtbar.

**🛑 Wenn das nicht klappt, hier stoppen und prüfen:**
- Läuft `npm run dev` noch?
- Stimmen die Env-Vars in `.env.local`?
- Browser-Console (F12) öffnen — gibt es Fehler?

#### A.6 Test-User in Supabase

Supabase → Authentication → Users → "Add user" → "Create new user":
- E-Mail: deine
- Passwort: setz eins
- "Auto Confirm User" ✓

✅ **Verifikation:** User taucht in Liste auf.

#### A.7 Lokal einloggen

Browser → `http://localhost:3000` → "Anmelden" → E-Mail + Passwort

✅ **Verifikation:** Du landest auf `/settings` mit "Willkommen bei TandemLog!"-Banner.

#### A.8 Settings ausfüllen

- Voller Name (Pflicht)
- IBAN (Pflicht)
- Office E-Mail = **deine eigene Gmail** (für Resend-Test später)
- MwSt-Nr. optional
- Speichern

✅ **Verifikation:** Seite refresht, Felder bleiben gefüllt. Klick auf TandemLog-Logo oben links → `/home` zeigt das Pilot-Dashboard.

#### A.9 Ersten Flug testen

`/log` öffnen → Form ist vorausgefüllt → "Eintragen"

✅ **Verifikation:** `/today` zeigt den Flug. `/summary` zeigt den Bon mit CHF 105.

**🎉 Wenn das alles geklappt hat: Code funktioniert 100%. Jetzt zu Vercel.**

---

### Phase B — Vercel sauber aufsetzen (15 Min)

#### B.0 Altes Vercel-Projekt löschen (falls vorhanden)

Vercel → Project → Settings → ganz unten → "Delete Project" → bestätigen.

#### B.1 Neu importieren

1. Vercel Dashboard → "Add New" → "Project"
2. GitHub `weiberem/PilotTandemApp` → "Import"
3. **Wichtig**: Konfiguration:
   - Framework Preset: **Next.js** (automatisch erkannt)
   - Root Directory: `.` (default)
   - Branch: **`main`** (default — NICHT ÄNDERN)
4. Environment Variables — **nur diese 4** eintragen:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://saletfmwcsqopvehimrv.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_…
   NEXT_PUBLIC_APP_URL=https://example.vercel.app
   ```
   (Den `NEXT_PUBLIC_APP_URL` korrigieren wir nach dem ersten Deploy.)
5. "Deploy" klicken

✅ **Verifikation:** Build läuft ~2 Min, dann "Congratulations 🎉" und eine URL.

#### B.2 URL prüfen

Die zugewiesene URL (z.B. `pilot-tandem-app-xyz.vercel.app`) im Browser öffnen.

✅ **Verifikation:** Welcome-Seite erscheint (nicht 404).

**🛑 Wenn 404:** zurück zur Deployments-Liste, klick auf den Build, schau ob er
"Ready" ist und auf Production gesetzt. Wenn nicht, "Promote to Production".

#### B.3 NEXT_PUBLIC_APP_URL korrigieren

Vercel → Settings → Environment Variables → `NEXT_PUBLIC_APP_URL` editieren:
- Auf die echte URL setzen (ohne trailing slash): `https://pilot-tandem-app-xyz.vercel.app`
- Save
- Vercel → Deployments → letzte → "Redeploy" (damit die Var greift)

#### B.4 Vollständiger Live-Test

URL öffnen → "Anmelden" → mit deinem Supabase-User einloggen → Settings → Flug erfassen → Bon ansehen.

✅ **Verifikation:** Komplette Mobile-Reise funktioniert wie lokal.

**🎉 Phase B fertig: Basis-App ist auf Vercel live.**

---

### Phase C — Google Drive verbinden (20 Min)

#### C.1 Google Cloud Project anlegen

1. https://console.cloud.google.com → "Select a project" → "New Project" → "TandemLog"
2. "APIs & Services" → "Library" → "Google Drive API" → **Enable**
3. "OAuth consent screen":
   - User type: **External**
   - App name: TandemLog
   - User support email: deine
   - Developer contact: deine
   - **Save and Continue**
4. "Scopes": Skip (default reicht)
5. "Test users": deine E-Mail hinzufügen → Save

#### C.2 OAuth Client erstellen

1. "Credentials" → "Create Credentials" → "OAuth client ID"
2. Application type: **Web application**
3. Name: "TandemLog Web"
4. **Authorized redirect URIs** → Add:
   ```
   https://<deine-vercel-url>/api/gdrive/callback
   ```
   (Optional auch `http://localhost:3000/api/gdrive/callback` für lokale Tests)
5. Create
6. **Client ID** und **Client Secret** kopieren

#### C.3 Env-Vars in Vercel

Vercel → Settings → Environment Variables → Add:

```
GOOGLE_CLIENT_ID=<Client-ID aus Schritt C.2>
GOOGLE_CLIENT_SECRET=<Client-Secret aus Schritt C.2>
GOOGLE_REDIRECT_URI=https://<deine-vercel-url>/api/gdrive/callback
```

→ Vercel → Deployments → letzte → "Redeploy"

#### C.4 In der App verbinden

1. Settings öffnen → Block "Google Drive":
   - **Hauptordner** = `https://drive.google.com/drive/folders/1V9jMqz_3iTZnlD3LMH_Rg1LSt0Equ9zk`
   - **Einsatzplan-Ordner** = `https://drive.google.com/drive/u/0/folders/12OdgU9fnpo3XINR6GeE3zVNJg7TG5HIQ`
   - (Die IDs werden automatisch extrahiert)
2. Speichern
3. Block "Google Drive Verbindung" → "Google Drive verbinden"
4. OAuth-Popup durchklicken

✅ **Verifikation:** Banner "Google Drive verbunden" + neuer Block "Monatliches Excel-Backup".

#### C.5 Einsatzplan-Sync testen

`/einsatzplan` öffnen → sollte die neueste Excel aus dem Skywings-Ordner ziehen.

✅ **Verifikation:** Tage werden gelistet mit Periode (Ganztag etc.).

**🛑 Wenn der Parser den Plan nicht versteht:** Screenshot vom Skywings-Excel-Format
schicken, dann `lib/einsatzplanParser.ts` anpassen.

---

### Phase D — Resend (E-Mails) (10 Min)

#### D.1 Account + Key

https://resend.com → Account → "API Keys" → Create → Name "TandemLog" → kopieren

#### D.2 Env-Vars in Vercel

```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=TandemLog <onboarding@resend.dev>
```

→ Redeploy

#### D.3 Sandbox-Limit verstehen

**Wichtig:** Ohne eigene verifizierte Domain kannst du **nur an deine eigene
Mail-Adresse** senden (die du bei Resend registriert hast). Für echtes Versenden
an Skywings musst du später eine Domain bei Resend verifizieren.

#### D.4 Test-Rechnung senden

1. In Settings → Office E-Mail = deine eigene Gmail (Sandbox-Test)
2. Ein paar Test-Flüge erfassen (`/log`)
3. `/dashboard/invoice` → Monat auswählen → "Rechnung senden"

✅ **Verifikation:** Mail kommt in deinem Gmail-Postfach an, mit PDF + XLSX als Anhang.

---

### Phase E — Cron (5 Min)

#### E.1 Env-Var

```
CRON_SECRET=<openssl rand -hex 32 in deinem Terminal, oder ein langer Random-String>
```

→ Redeploy

#### E.2 Cron-Schedule prüfen

Vercel → Project → "Crons" Tab → sollte ein Eintrag sein:
- Path: `/api/cron/monthly-invoice`
- Schedule: `0 6 1 * *` (1. des Monats 06:00 UTC = 07:00 CET / 08:00 CEST)

✅ **Verifikation:** Cron ist gelistet.

**Erster echter Run:** am 1. des nächsten Monats automatisch. Du kriegst dann
eine Mail "Rechnung bereit zur Kontrolle".

---

### Phase F — Admin-Bootstrap (2 Min)

Damit du `/admin` öffnen und weitere Piloten einladen kannst:

```sql
-- In Supabase SQL Editor:
select id, email from auth.users where email = 'remy.weibel@gmail.com';

-- Mit der ID aus dem Result:
insert into admins (id) values ('<deine-user-id>');
```

✅ **Verifikation:** App → `/admin` öffnen → Piloten-Liste sichtbar.

---

## 10. Troubleshooting (Lessons Learned)

### 404 NOT_FOUND auf der Stable-URL (`*.vercel.app`)

**Ursache 1:** Die URL ist nicht an ein aktives Production-Deployment gebunden.
- Prüfen: Vercel → Settings → Domains → zeigt die Domain auf "Production"?
- Prüfen: Vercel → Deployments → ist überhaupt ein Build als "Production" markiert?
- Fix: ggf. einen grünen Build manuell promoten (drei Punkte → "Promote to Production")

**Ursache 2:** Production-Branch in Vercel-Settings stimmt nicht mit dem
tatsächlich gepushten Branch überein.
- Prüfen: Settings → Git → "Production Branch" sollte `main` sein.

**Ursache 3:** Du benutzt eine **deployment-spezifische Hash-URL** wie
`pilot-tandem-9qpb8lfib-...vercel.app`. Diese sind temporär und können verwaisen.
- Fix: nur die kurze Stable-URL `<projekt-name>.vercel.app` verwenden.

### 500 MIDDLEWARE_INVOCATION_FAILED

Wir hatten dieses Problem mit `@supabase/ssr@0.5.x` — fixed durch:
- Upgrade auf `@supabase/ssr@0.10+`
- Im aktuellen Codestand: **gar keine middleware.ts** mehr. Auth läuft in
  Server-Components. Sollte nicht mehr auftreten.

### Build-Fehler "Edge Function references unsupported modules"

- Middleware darf nichts importieren was Node-spezifisch ist.
- Aktueller Code: keine Middleware → kein Problem.

### `__dirname is not defined`

- Alte Version von `@supabase/ssr` (< 0.10) verursacht das.
- Aktuell auf 0.10.3 — sollte nicht mehr auftreten.

### "no_files_in_folder" bei Einsatzplan-Sync

- Der konfigurierte `einsatzplan_folder_id` zeigt auf einen leeren Ordner,
  oder Excel-/Sheets-Dateien wurden ausgefiltert.
- Prüfen: hat der OAuth-User Lese-Recht auf den Ordner?

### Resend "verified emails only"

- Free-Tier ohne Domain-Verifikation: du kannst nur an deine eigene
  bei Resend registrierte Mail senden.
- Workaround für Testing: Office-E-Mail in Settings = deine eigene Mail.
- Für Production: Domain bei Resend verifizieren, dann `RESEND_FROM_EMAIL`
  auf deine Domain umstellen.

---

## 11. Tests

```bash
npm test
```

44 Unit-Tests in `lib/*.test.ts`:
- `tripTimes.test.ts` (15) — Trip-Time-Logik
- `flights.test.ts` (9) — DayTotals + Zod-Schema
- `availability.test.ts` (7) — Monatsgrid + mailto
- `invoice.test.ts` (8) — Invoice-Aggregation + VAT
- `stats.test.ts` (2) — Jahres-Stats + VKPI
- `einsatzplanParser.test.ts` (3) — Excel-Parser
- `utils.test.ts` (7) — extractDriveId etc.

```bash
npm run typecheck    # tsc --noEmit
npm run build        # production build lokal
```

---

## 12. Schlüssel-Workflows visuell

### Täglicher Pilot-Workflow

```
Aufstehen → Smartphone → URL öffnen → ✈️ klicken
  → Flugzeit wird vorgeschlagen → Eintragen
  → [Nächster Flug] → wieder Eintragen
  → Ende des Tages: Tagesabschluss → Screenshot → an Desk weiterleiten
```

### Monatsende

```
1. des Folgemonats 07:00:
  → Cron läuft → Draft in /dashboard/invoice → Mail an Pilot
  → Backup-Excel im Drive-Hauptordner

Pilot:
  → /dashboard/invoice öffnen → Vorschau prüfen
  → "Rechnung senden" → Mail an Skywings + PDF/XLSX in Drive/<YYYY>/<MM>/
```

### Verfügbarkeit einreichen

```
Bis 15. des Monats:
  → /availability öffnen → Kalender für nächsten Monat
  → Tage taggen (Ganztag / Halbtag AM / PM)
  → "E-Mail vorbereiten" → mailto: öffnet sich
  → an office@skywings senden
```

---

## 13. Wichtige Befehle

```bash
# Lokal entwickeln
npm run dev

# Tests laufen lassen
npm test

# Type-Check (kein Build)
npm run typecheck

# Production-Build lokal (verifizieren bevor Push)
npm run build

# Aktuelle Routes inspizieren
npm run build 2>&1 | grep "^[├└┌]"
```

---

## 14. Wo du was findest

| Du suchst… | Datei |
|---|---|
| Trip-Times anpassen | `lib/tripTimes.ts` |
| Tarife ändern (Default) | `supabase/migrations/001_initial_schema.sql` ODER pro Pilot in `/settings` |
| Rechnungs-Layout (XLSX) | `lib/invoiceGenerator.ts` |
| Rechnungs-Layout (PDF) | `lib/pdfGenerator.tsx` |
| Backup-Excel-Layout | `lib/backupXlsx.ts` |
| Einsatzplan-Format ändern | `lib/einsatzplanParser.ts` |
| Mobile-Design / Farben | `tailwind.config.ts` + `app/globals.css` |
| Cron-Logik | `app/api/cron/monthly-invoice/route.ts` |
| Cron-Schedule | `vercel.json` |

---

**Stand:** Code committet auf `main` und `claude/blissful-thompson-D3wzf`,
Commit `893d251`. 44 Tests grün. Build clean. Wartet auf sauberen Vercel-Deploy.
