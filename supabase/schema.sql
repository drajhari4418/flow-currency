-- ============================================================
-- TaskFlow — full database schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New
-- query). Safe to re-run: every statement is idempotent, so it works
-- whether you're starting from a totally empty project or already ran
-- earlier partial versions of this schema.
-- Supabase Auth (auth.users) is already set up for you automatically.
-- ============================================================

-- ---------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- Adds priority/due_date if this table already existed without them.
alter table public.tasks
  add column if not exists priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  add column if not exists due_date date;

alter table public.tasks enable row level security;

drop policy if exists "Users can view their own tasks" on public.tasks;
create policy "Users can view their own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own tasks" on public.tasks;
create policy "Users can insert their own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own tasks" on public.tasks;
create policy "Users can update their own tasks"
  on public.tasks for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own tasks" on public.tasks;
create policy "Users can delete their own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- conversions
-- ---------------------------------------------------------------
create table if not exists public.conversions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount        numeric not null,
  from_currency text not null,
  to_currency   text not null,
  result        numeric not null,
  created_at    timestamptz not null default now()
);

create index if not exists conversions_user_id_idx on public.conversions (user_id);
create index if not exists conversions_created_at_idx on public.conversions (created_at desc);

alter table public.conversions enable row level security;

drop policy if exists "Users can view their own conversions" on public.conversions;
create policy "Users can view their own conversions"
  on public.conversions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own conversions" on public.conversions;
create policy "Users can insert their own conversions"
  on public.conversions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own conversions" on public.conversions;
create policy "Users can delete their own conversions"
  on public.conversions for delete
  using (auth.uid() = user_id);

-- Note: the backend uses the service_role key for "tasks" (bypasses RLS,
-- so it enforces user_id = req.user.id manually in every query — see
-- backend/routes/tasks.js). "conversions" is written directly from Angular
-- using the anon key + the user's own session, so RLS above is the only
-- protection for that table — same as the Frankfurter rate lookups, which
-- also bypass the backend entirely.
