-- Core identity and the module catalog.
--
-- The app is a widget host: a module declares what it records, what it publishes
-- for other modules to read, and how a day's entries roll up into one number.
-- Everything else in the schema hangs off `entries`, which is module-agnostic.

create extension if not exists pgcrypto;

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null unique,
  display_name  text,
  time_zone     text not null default 'UTC',
  weight_unit   text not null default 'lb' check (weight_unit in ('lb', 'kg')),
  distance_unit text not null default 'mi' check (distance_unit in ('mi', 'km')),
  created_at    timestamptz not null default now()
);

comment on table public.profiles is
  'One row per account. Connections are searched by email, so it is unique here.';

-- ── module catalog ──────────────────────────────────────────────────────────
-- Seeded, not user-writable. `value_kind` decides how a day rolls up: weight is
-- the last reading of the day, calories/pages/miles/words are the sum.
create table public.modules (
  slug           text primary key,
  name           text not null,
  icon           text not null,
  unit           text,
  value_kind     text not null check (value_kind in ('last', 'sum')),
  primary_series text not null,
  publishes      text[] not null default '{}',
  subscribes     text[] not null default '{}',
  log_label      text not null,
  sort_order     int not null default 0
);

insert into public.modules
  (slug, name, icon, unit, value_kind, primary_series, publishes, subscribes, log_label, sort_order)
values
  ('weight',   'Weight',   'scale',    'lb',    'last', 'weight.daily',
   '{weight.daily}', '{}', 'Log weight', 10),
  ('calories', 'Calories', 'utensils', 'kcal',  'sum',  'calories.daily',
   '{calories.daily,calories.meals}', '{weight.daily}', 'Log meal', 20),
  ('reading',  'Reading',  'book-open', 'pages', 'sum',  'reading.pages',
   '{reading.pages,reading.books}', '{}', 'Log pages', 30),
  ('running',  'Running',  'footprints', 'mi',  'sum',  'running.miles',
   '{running.miles,running.pace}', '{}', 'Log run', 40),
  ('writing',  'Writing',  'pencil',   'words', 'sum',  'writing.words',
   '{writing.words}', '{}', 'Log session', 50),
  ('sleep',    'Sleep',    'bell',     'h',     'sum',  'sleep.hours',
   '{sleep.hours}', '{}', 'Log sleep', 60);

-- ── activation ──────────────────────────────────────────────────────────────
create table public.user_modules (
  user_id      uuid not null references auth.users (id) on delete cascade,
  module_slug  text not null references public.modules (slug) on delete cascade,
  active       boolean not null default true,
  position     int not null default 0,
  settings     jsonb not null default '{}'::jsonb,
  activated_at timestamptz not null default now(),
  primary key (user_id, module_slug)
);

comment on column public.user_modules.settings is
  'Per-module preferences. Calories uses {"source_order":["usda","off"],"daily_target":2200}.';

-- ── new accounts ────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  -- Weight, Calories and Reading are on by default; the rest are opt-in.
  insert into public.user_modules (user_id, module_slug, active, position, settings)
  values
    (new.id, 'weight',   true,  10, '{}'::jsonb),
    (new.id, 'calories', true,  20,
     '{"source_order":["usda","off"],"daily_target":2200}'::jsonb),
    (new.id, 'reading',  true,  30, '{}'::jsonb),
    (new.id, 'running',  false, 40, '{}'::jsonb),
    (new.id, 'writing',  false, 50, '{}'::jsonb),
    (new.id, 'sleep',    false, 60, '{}'::jsonb)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
