# TaskFlow — Update Notes (this pass)

## 1. Security fix (do this first)
`backend/.env` was committed to the repo with a real `SUPABASE_SERVICE_ROLE_KEY`
in it, and `ANTHROPIC_API_KEY` was set to a URL instead of an actual key.

- **Rotate the service role key**: Supabase dashboard → Project Settings →
  API → regenerate → update it in your local `backend/.env` and in Render's
  environment variables.
- **Fix the Anthropic key**: paste your real key (starts `sk-ant-`) into
  `ANTHROPIC_API_KEY` in `backend/.env` — it was previously
  `https://flow-currency.onrender.com/api`, which silently breaks Quick
  Convert's AI parsing.
- **Stop tracking `.env`**: `git rm --cached backend/.env && git commit -m
  "stop tracking .env"`. Your `.gitignore` already lists it, but that only
  prevents *future* commits — it doesn't erase it from history that's
  already been pushed to GitHub.

## 2. Same-day reminder added
Previously only "due tomorrow" triggered a reminder. Now there are two
independent stages:
- **Day before** (unchanged) — `reminder_day_before_sent`
- **Due day** (new) — `reminder_due_day_sent`

Run `supabase/tasks_reminders_same_day_migration.sql` once in the Supabase
SQL Editor (safe to run even if you haven't run the original
`tasks_reminders_migration.sql` — this one checks for that itself).

To configure the actual emails: fill in `SMTP_HOST` / `SMTP_PORT` /
`SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` in **`backend/.env`** — not
`.env.example`, Express never reads that file. Supabase's own
Authentication → Emails → SMTP Settings page is unrelated to this feature;
it only controls Supabase's own signup/magic-link emails.

## 3. Tasks moved to their own page
Tasks (add form, progress bar, cards, and both reminder banners) now live
at `/tasks` instead of on the dashboard. The dashboard has a "📋 My Tasks"
link in its header, and the tasks page has a "← Back to dashboard" link.

## 4. Tasks now auto-remove themselves
Two behaviors, both destructive with **no undo**:
- **Completing a task**: it stays visible (checked, struck through) for
  ~3 seconds, then fades out and is permanently deleted.
- **Overdue tasks**: any incomplete task more than 3 days past its due
  date is deleted the next time you open `/tasks`.

Both delays (`COMPLETE_REMOVE_DELAY_MS`, `OVERDUE_DELETE_GRACE_DAYS`) are
constants at the top of `frontend/src/app/pages/tasks/tasks.component.ts`
if you want to change them — they weren't specified, so these are
reasonable defaults, not settled requirements.

## Files touched in this pass
```
supabase/tasks_reminders_same_day_migration.sql   NEW
backend/config/mailer.js                          UPDATED
backend/services/reminders.js                      UPDATED
backend/server.js                                   UPDATED
backend/.env.example                                 UPDATED (blanked)
backend/.env                                          UPDATED (fixed key, added SMTP fields)
frontend/src/app/app.routes.ts                        UPDATED
frontend/src/app/pages/tasks/tasks.component.ts       NEW
frontend/src/app/pages/dashboard/dashboard.component.ts UPDATED (tasks removed, link added)
frontend/src/styles.css                                UPDATED (appended, nothing removed)
```
