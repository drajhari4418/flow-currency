alter table public.tasks
  add column if not exists priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  add column if not exists due_date date;
