# TaskFlow — Tasks Upgrade (Priority, Due Dates, Progress Bar, Card Layout)

Copy these files into your existing `taskflow/` repo, overwriting where noted.

## What changed

1. **Priority levels.** Every task now has `priority`: `low` / `medium` / `high`
   (defaults to `medium`). Shown as a colored badge and as a left-border color
   on the card (green / amber / red).
2. **Due dates.** Optional `due_date` per task. Shown as a badge; turns red
   and reads "Overdue" if the date has passed and the task isn't done.
3. **Progress bar.** Above the task list: "X of Y tasks completed" with a
   fill bar, computed live from your task signal.
4. **Card-based layout.** Tasks now render as a responsive grid of cards
   instead of a plain list — more breathing room, priority color-coding,
   and badges for priority/due date.

## Files in this package

```
supabase/
  tasks_priority_due_date_migration.sql   NEW — run in Supabase SQL Editor
backend/routes/
  tasks.js                                REPLACES existing file
frontend/src/
  styles.css                              REPLACES existing file (includes
                                           the theme/footer work from before)
  app/services/task.service.ts            REPLACES existing file
  app/pages/dashboard/dashboard.component.ts   REPLACES existing file
```

## Setup steps

1. **Run the migration.** Supabase dashboard → SQL Editor → New query →
   paste the contents of `supabase/tasks_priority_due_date_migration.sql`
   → Run. This only *adds* two columns (`priority`, `due_date`) to your
   existing `tasks` table — no data is touched, and existing rows get
   `priority = 'medium'` and `due_date = null` automatically.

2. **Copy the files** into your project at the matching paths.
   - `frontend/src/styles.css` already includes everything from the earlier
     dark/light theme + footer update, so this one file replace covers both.

3. **Restart both servers** (backend and frontend) so the new columns and
   component code take effect:
   ```bash
   cd backend && npm run dev
   cd frontend && npm start
   ```

4. **Test it:**
   - Add a task, pick a priority, pick a due date in the past → card should
     show a red "Overdue" badge.
   - Complete a few tasks → progress bar and "X of Y" count should update.
   - Resize the browser → cards should reflow into a responsive grid.

## Notes

- `TaskService.create()` signature changed from
  `create(title, description?)` to
  `create(title, priority?, due_date?, description?)` — if you have any
  other code calling it directly, update the call site accordingly.
- The backend validates `priority` against `['low','medium','high']` and
  silently falls back to `'medium'` on create if something invalid is sent;
  `PUT` returns a 400 instead, since that's an explicit edit.
