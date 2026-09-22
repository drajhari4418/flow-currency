-- Adds due-date reminder support to public.tasks.
-- Safe to re-run.

alter table public.tasks
  add column if not exists reminder_sent boolean not null default false;

-- If a user changes a task's due_date, or reopens a task that was marked
-- complete, clear reminder_sent so the backend's daily job will consider
-- it fresh again instead of skipping it forever.
create or replace function public.reset_task_reminder_flag()
returns trigger as $$
begin
  if (new.due_date is distinct from old.due_date)
     or (new.is_complete = false and old.is_complete = true) then
    new.reminder_sent := false;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reset_task_reminder_flag on public.tasks;
create trigger trg_reset_task_reminder_flag
  before update on public.tasks
  for each row
  execute function public.reset_task_reminder_flag();
