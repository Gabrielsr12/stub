-- ===== FASE 2: perfis públicos + atividades (fundação da timeline) =====
-- Não mexe na tabela stub_data existente. É só uma extensão ao lado.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar text,
  bio text,
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
drop policy if exists "profiles select" on profiles;
create policy "profiles select" on profiles for select using (auth.role() = 'authenticated');
drop policy if exists "profiles insert own" on profiles;
create policy "profiles insert own" on profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles for update using (auth.uid() = id);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('rated','favorited','watchlisted')),
  movie_id integer not null,
  movie_title text not null,
  poster_path text,
  rating integer,
  comment text,
  created_at timestamptz not null default now()
);
alter table activities enable row level security;
-- Fase 2: cada um só vê a própria atividade (a Fase 3 amplia isso para incluir quem você segue)
drop policy if exists "activities select own" on activities;
create policy "activities select own" on activities for select using (user_id = auth.uid());
drop policy if exists "activities insert own" on activities;
create policy "activities insert own" on activities for insert with check (auth.uid() = user_id);
drop policy if exists "activities delete own" on activities;
create policy "activities delete own" on activities for delete using (auth.uid() = user_id);

create index if not exists activities_user_created_idx on activities (user_id, created_at desc);
