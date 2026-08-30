-- Run this in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query)
-- Supabase Auth (auth.users) is already set up for you automatically —
-- you just need to create the app's own table and secure it.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security so users can only ever see/edit their own rows.
alter table public.tasks enable row level security;

-- Policies: a user may only select/insert/update/delete rows where user_id = their own id.
create policy "Users can view their own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);

-- Note: the backend uses the service_role key, which bypasses RLS entirely,
-- so it enforces "user_id = req.user.id" manually in every query (see routes/tasks.js).
-- RLS is still enabled here as defense-in-depth, and matters if you ever
-- query Supabase directly from the frontend with the anon key.
