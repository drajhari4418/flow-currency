-- Follow-up to tasks_reminders_migration.sql — adds a same-day reminder
-- alongside the existing day-before one. Safe to re-run, and safe even if
-- the original tasks_reminders_migration.sql was never run (this migration
-- checks for and handles that case itself).

-- If the original single reminder_sent column exists, rename it so it
-- becomes the "day before" flag instead of losing its history.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'reminder_sent'
  ) then
    alter table public.tasks rename column reminder_sent to reminder_day_before_sent;
  end if;
end
$$;

alter table public.tasks
  add column if not exists reminder_day_before_sent boolean not null default false;

alter table public.tasks
  add column if not exists reminder_due_day_sent boolean not null default false;

-- Replaces the earlier trigger: now resets BOTH flags (not just one) when
-- the due date changes or a completed task is reopened, so both stages
-- become eligible again.
create or replace function public.reset_task_reminder_flag()
returns trigger as $$
begin
  if (new.due_date is distinct from old.due_date)
     or (new.is_complete = false and old.is_complete = true) then
    new.reminder_day_before_sent := false;
    new.reminder_due_day_sent := false;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reset_task_reminder_flag on public.tasks;
create trigger trg_reset_task_reminder_flag
  before update on public.tasks
  for each row
  execute function public.reset_task_reminder_flag();
