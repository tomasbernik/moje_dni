create extension if not exists pgcrypto;

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  title text not null default '',
  mood text not null default '',
  content text not null default '',
  photos jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

alter table public.diary_entries enable row level security;

drop policy if exists "Users can read own diary entries" on public.diary_entries;
create policy "Users can read own diary entries"
  on public.diary_entries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own diary entries" on public.diary_entries;
create policy "Users can insert own diary entries"
  on public.diary_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own diary entries" on public.diary_entries;
create policy "Users can update own diary entries"
  on public.diary_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own diary entries" on public.diary_entries;
create policy "Users can delete own diary entries"
  on public.diary_entries for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('moje-dni-photos', 'moje-dni-photos', false)
on conflict (id) do nothing;

drop policy if exists "Users can read own diary photos" on storage.objects;
create policy "Users can read own diary photos"
  on storage.objects for select
  using (
    bucket_id = 'moje-dni-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can upload own diary photos" on storage.objects;
create policy "Users can upload own diary photos"
  on storage.objects for insert
  with check (
    bucket_id = 'moje-dni-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own diary photos" on storage.objects;
create policy "Users can update own diary photos"
  on storage.objects for update
  using (
    bucket_id = 'moje-dni-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'moje-dni-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own diary photos" on storage.objects;
create policy "Users can delete own diary photos"
  on storage.objects for delete
  using (
    bucket_id = 'moje-dni-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
