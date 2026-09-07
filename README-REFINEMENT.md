# TaskFlow Refinement — Merged Dashboard + Theme Toggle + Footer

This folder contains the changed/new files only. Copy each one into the
matching path in your existing `taskflow/` repo, overwriting the old version.

## What changed

1. **Dashboard now shows currency conversion data.**
   Previously, `/dashboard` only showed tasks, and conversion history lived
   solely on `/currency` (in-memory, lost on refresh). Now:
   - A new `conversions` table stores every conversion in Supabase, scoped
     per user with Row Level Security (same pattern as `tasks`).
   - `ConversionService` (new) writes to that table and computes summary
     stats (total conversions, favorite pair, favorite currency, last
     conversion) — the same logic your standalone converter app's
     `dashboard.js` used, ported into Angular.
   - `DashboardComponent` now renders a **"Currency Overview"** section
     (stat cards + last 5 conversions) above the task list, so logging in
     takes you straight to both your tasks *and* your conversion summary.
   - The `/currency` page is still where you actually perform a new
     conversion — it now also silently logs each one to Supabase so the
     dashboard stays current.

2. **Light/dark theme toggle.**
   `ThemeService` (new) tracks the theme in a signal, persists the choice
   in `localStorage`, and toggles a `dark-theme` class on `<body>`.
   `styles.css` was rewritten to use CSS variables (`--bg`, `--text`,
   `--card-bg`, etc.) so every existing page (login, signup, dashboard,
   converter) reacts to the toggle automatically — no per-component theme
   logic needed. A 🌙/☀️ button was added next to "Log out" and next to
   "Back to dashboard".

3. **Static footer.**
   `"Created and Developed by Dushyant Kaushik"` now appears at the bottom
   of the dashboard and currency-converter pages.

## Files in this package

```
supabase/
  conversions_schema.sql          NEW — run in Supabase SQL Editor
frontend/src/
  styles.css                      REPLACES existing file
  app/app.component.ts            REPLACES existing file
  app/services/
    supabase.service.ts           REPLACES existing file
    conversion.service.ts         NEW
    theme.service.ts              NEW
  app/pages/
    dashboard/dashboard.component.ts           REPLACES existing file
    currency-converter/currency-converter.component.ts   REPLACES existing file
```

## Setup steps

1. **Run the SQL.** Open your Supabase project → SQL Editor → New query →
   paste the contents of `supabase/conversions_schema.sql` → Run.
   (Your existing `tasks` table and its policies are untouched.)

2. **Copy the files** into your Angular project at the matching paths,
   overwriting where noted above.

3. **No new npm packages are required** — everything uses
   `@supabase/supabase-js`, which is already a dependency.

4. **Run it:**
   ```bash
   cd frontend
   npm start
   ```
   Log in, make a conversion on `/currency`, then go to `/dashboard` — the
   "Currency Overview" cards and recent-conversions table should reflect it
   immediately (stats are re-fetched on every dashboard load).

## Notes

- Conversion reads/writes go **directly from Angular to Supabase** (anon
  key + the user's session), the same way the Frankfurter rate lookups
  already bypass the Node backend — RLS enforces that a user can only ever
  see or write their own rows. The `tasks` table's flow through
  Express/`supabaseAdmin` is unchanged.
- The theme preference is stored client-side only (`localStorage`), so it's
  per-browser, not per-account. If you later want it synced across
  devices, it could be stored as a column on the Supabase user instead.
