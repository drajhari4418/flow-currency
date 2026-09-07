-- Run this in the Supabase SQL Editor IN ADDITION to your existing schema.sql
-- (which already creates the "tasks" table). This adds a "conversions" table
-- so the currency converter's history can be persisted per-user and shown
-- as a summary on the main dashboard, instead of living only in memory.

create table if not exists public.conversions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount        numeric not null,
  from_currency text not null,
  to_currency   text not null,
  result        numeric not null,
  created_at    timestamptz not null default now()
);

-- Helpful indexes for dashboard queries (recent history, per-user lookups)
create index if not exists conversions_user_id_idx on public.conversions (user_id);
create index if not exists conversions_created_at_idx on public.conversions (created_at desc);

-- Enable Row Level Security so users can only ever see their own conversions.
alter table public.conversions enable row level security;

create policy "Users can view their own conversions"
  on public.conversions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conversions"
  on public.conversions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own conversions"
  on public.conversions for delete
  using (auth.uid() = user_id);

-- Note: unlike the "tasks" table, conversions are written directly from the
-- Angular frontend using the Supabase anon key + the user's own session
-- (not routed through the Node backend), since this data is not sensitive
-- and RLS alone is sufficient protection here — consistent with how the
-- currency-rate lookups already bypass the backend entirely.
