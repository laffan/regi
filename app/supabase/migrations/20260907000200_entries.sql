-- The spine: every module writes timestamped entries into one table, which is
-- what lets the calendar render a day summary per module without knowing what
-- any module is.

create type public.entry_source as enum ('manual', 'log', 'saved_meal', 'import');
create type public.food_source  as enum ('usda', 'off', 'manual', 'saved');

create table public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  module_slug text not null references public.modules (slug),
  occurred_at timestamptz not null default now(),
  local_date  date not null,
  value       numeric,
  unit        text,
  label       text,
  note        text,
  payload     jsonb not null default '{}'::jsonb,
  source      public.entry_source not null default 'manual',
  created_at  timestamptz not null default now()
);

comment on column public.entries.local_date is
  'The calendar join key, in the profile time zone. Filled from occurred_at when the client omits it.';
comment on column public.entries.payload is
  'Module-shaped extras: reading {book_id,end_page}, running {duration_s,pace}, calories {meal_of}.';

create index entries_user_date_idx   on public.entries (user_id, local_date desc);
create index entries_user_module_idx on public.entries (user_id, module_slug, local_date desc);

create or replace function public.entries_fill_local_date()
returns trigger
language plpgsql
as $$
declare
  tz text;
begin
  if new.local_date is null then
    select time_zone into tz from public.profiles where id = new.user_id;
    new.local_date := (new.occurred_at at time zone coalesce(tz, 'UTC'))::date;
  end if;
  return new;
end;
$$;

create trigger entries_fill_local_date
  before insert or update of occurred_at, local_date on public.entries
  for each row execute function public.entries_fill_local_date();

-- ── calories ────────────────────────────────────────────────────────────────
-- A Calories entry is a meal; its items carry the database match, so the module
-- detail can show what each line was priced against.
create table public.meal_items (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.entries (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  portion      text,
  kcal         numeric not null default 0,
  match_source public.food_source not null default 'manual',
  match_ref    text,
  position     int not null default 0
);

create index meal_items_entry_idx on public.meal_items (entry_id);

-- Keep the meal's headline value equal to the sum of its items.
create or replace function public.meal_items_resum()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.entry_id, old.entry_id);
begin
  update public.entries e
     set value = coalesce((select sum(mi.kcal) from public.meal_items mi where mi.entry_id = target), 0)
   where e.id = target;
  return null;
end;
$$;

create trigger meal_items_resum
  after insert or update or delete on public.meal_items
  for each row execute function public.meal_items_resum();

create table public.saved_meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  detail     text,
  kcal       numeric not null default 0,
  items      jsonb not null default '[]'::jsonb,
  uses       int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.saved_meals is
  'A combination or a single item, saved from the log for one-tap entry.';

-- ── reading ─────────────────────────────────────────────────────────────────
create table public.books (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  author       text,
  cover_url    text,
  total_pages  int,
  current_page int not null default 0,
  status       text not null default 'reading' check (status in ('reading', 'finished', 'shelved')),
  started_on   date,
  finished_on  date,
  created_at   timestamptz not null default now()
);

create index books_user_status_idx on public.books (user_id, status);

-- A reading entry that names an end page advances the book.
create or replace function public.reading_advance_book()
returns trigger
language plpgsql
as $$
declare
  b_id  uuid := nullif(new.payload ->> 'book_id', '')::uuid;
  b_end int  := nullif(new.payload ->> 'end_page', '')::int;
begin
  if new.module_slug <> 'reading' or b_id is null or b_end is null then
    return new;
  end if;

  update public.books
     set current_page = greatest(current_page, b_end),
         status       = case when total_pages is not null and b_end >= total_pages
                             then 'finished' else status end,
         finished_on  = case when total_pages is not null and b_end >= total_pages
                             then coalesce(finished_on, new.local_date) else finished_on end
   where id = b_id and user_id = new.user_id;

  return new;
end;
$$;

create trigger reading_advance_book
  after insert on public.entries
  for each row execute function public.reading_advance_book();

-- ── goals and milestones ────────────────────────────────────────────────────
-- Goals recur, milestones happen once. Both surface on the calendar and in the
-- dashboard's "Coming up" list.
create type public.goal_kind    as enum ('goal', 'milestone');
create type public.goal_cadence as enum ('daily', 'weekly', 'monthly', 'once');

create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  module_slug text not null references public.modules (slug) on delete cascade,
  kind        public.goal_kind not null default 'goal',
  title       text not null,
  series      text,
  target      numeric,
  comparator  text check (comparator in ('<=', '>=', '=')),
  cadence     public.goal_cadence not null default 'daily',
  due_on      date,
  achieved_at timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint milestones_are_one_off check (kind <> 'milestone' or cadence = 'once')
);

create index goals_user_idx on public.goals (user_id, active, due_on);
