-- Required for the Dashboard conversion-history Delete button.
-- Run this once in Supabase Dashboard -> SQL Editor.
-- It is safe to run more than once.

alter table public.conversions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'conversions'
      and policyname = 'Users can delete own conversions'
  ) then
    create policy "Users can delete own conversions"
      on public.conversions
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;
