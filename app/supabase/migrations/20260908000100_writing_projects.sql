-- Writing becomes a project tracker with two units.
--
-- A session belongs to a project and is measured in either words or minutes —
-- some days you count words, some days you only know you sat there for half an
-- hour. That means a module can now record more than one unit, which the day
-- rollup has to handle without ever adding 800 words to 25 minutes.
--
-- The mechanism is declarative rather than a special case for Writing: a module
-- may name a settings key that picks its headline unit (`measure_setting`), and
-- may map units to series names (`series_by_unit`). Every other module leaves
-- both null and behaves exactly as before.

alter table public.modules
  add column measure_setting text,
  add column series_by_unit  jsonb;

comment on column public.modules.measure_setting is
  'Settings key naming the unit that leads on the calendar. Null means the module records one unit.';
comment on column public.modules.series_by_unit is
  'Unit → published series name, for modules that publish one series per unit.';

update public.modules
   set publishes       = '{writing.words,writing.minutes,writing.projects}',
       measure_setting = 'measure',
       series_by_unit  = '{"words":"writing.words","min":"writing.minutes"}'::jsonb,
       unit            = 'words'
 where slug = 'writing';

-- New accounts get a headline unit for Writing.
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

  insert into public.user_modules (user_id, module_slug, active, position, settings)
  values
    (new.id, 'weight',   true,  10, '{}'::jsonb),
    (new.id, 'calories', true,  20,
     '{"source_order":["usda","off"],"daily_target":2200}'::jsonb),
    (new.id, 'reading',  true,  30, '{}'::jsonb),
    (new.id, 'running',  false, 40, '{}'::jsonb),
    (new.id, 'writing',  false, 50, '{"measure":"words"}'::jsonb),
    (new.id, 'sleep',    false, 60, '{}'::jsonb)
  on conflict do nothing;

  return new;
end;
$$;

update public.user_modules
   set settings = settings || '{"measure":"words"}'::jsonb
 where module_slug = 'writing'
   and not (settings ? 'measure');

-- ── projects ────────────────────────────────────────────────────────────────
-- Shaped like `books`, for the same reason: a module's work usually belongs to
-- a thing you are working through.
create table public.writing_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  kind        text,
  measure     text not null default 'words' check (measure in ('words', 'min')),
  target      numeric,
  target_kind text not null default 'total' check (target_kind in ('total', 'daily')),
  status      text not null default 'active' check (status in ('active', 'finished', 'shelved')),
  started_on  date,
  finished_on date,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

comment on column public.writing_projects.measure is
  'What this project is usually measured in. A session may still be logged in the other unit.';
comment on column public.writing_projects.target_kind is
  '"total" for a project-sized target (50,000 words); "daily" for a per-day one (30 min).';

create index writing_projects_user_idx on public.writing_projects (user_id, status, position);

-- Totals are derived, never stored, so editing or deleting a session cannot
-- leave a project's count drifting.
create view public.writing_project_totals
with (security_invoker = on) as
select
  e.user_id,
  (e.payload ->> 'project_id')::uuid                      as project_id,
  coalesce(sum(e.value) filter (where e.unit = 'words'), 0) as words,
  coalesce(sum(e.value) filter (where e.unit = 'min'), 0)   as minutes,
  count(*)                                                as sessions,
  max(e.local_date)                                       as last_on,
  min(e.local_date)                                       as first_on
from public.entries e
where e.module_slug = 'writing'
  and e.payload ? 'project_id'
  and e.value is not null
group by e.user_id, (e.payload ->> 'project_id')::uuid;

-- ── rollups, now unit-aware ─────────────────────────────────────────────────
drop view if exists public.published_series;
drop view if exists public.daily_module_totals;

-- One row per user / day / module / unit.
create view public.daily_module_measures
with (security_invoker = on) as
select
  e.user_id,
  e.local_date,
  e.module_slug,
  coalesce(e.unit, m.unit, 'value') as unit,
  case
    when m.value_kind = 'sum' then sum(e.value)
    else (array_agg(e.value order by e.occurred_at desc))[1]
  end                               as value,
  count(*)                          as entry_count,
  max(e.occurred_at)                as last_at
from public.entries e
join public.modules m on m.slug = e.module_slug
where e.value is not null
group by e.user_id, e.local_date, e.module_slug, coalesce(e.unit, m.unit, 'value'), m.value_kind;

-- Which unit leads for this user and module.
create view public.module_headline_unit
with (security_invoker = on) as
select
  um.user_id,
  m.slug                                                       as module_slug,
  coalesce(um.settings ->> m.measure_setting, m.unit, 'value') as unit
from public.user_modules um
join public.modules m on m.slug = um.module_slug;

-- One row per user / day / module, as before. `value` is the headline unit's
-- number; `measures` carries every unit, so a module that records two can print
-- both without the rollup pretending they are the same quantity. Presence is
-- `entry_count`, not `value` — a minutes-only day is still a day you wrote.
create view public.daily_module_totals
with (security_invoker = on) as
select
  d.user_id,
  d.local_date,
  d.module_slug,
  max(d.value) filter (where d.unit = h.unit) as value,
  h.unit                                      as unit,
  sum(d.entry_count)::int                     as entry_count,
  max(d.last_at)                              as last_at,
  jsonb_object_agg(d.unit, d.value)           as measures
from public.daily_module_measures d
left join public.module_headline_unit h
  on h.user_id = d.user_id and h.module_slug = d.module_slug
group by d.user_id, d.local_date, d.module_slug, h.unit;

-- A module with `series_by_unit` publishes one series per unit; everything else
-- publishes its primary series, exactly as before.
create view public.published_series
with (security_invoker = on) as
select
  d.user_id,
  d.local_date,
  coalesce(m.series_by_unit ->> d.unit, m.primary_series) as series,
  d.module_slug,
  d.value,
  d.unit
from public.daily_module_measures d
join public.modules m on m.slug = d.module_slug;

-- ── access ──────────────────────────────────────────────────────────────────
alter table public.writing_projects enable row level security;

create policy writing_projects_read on public.writing_projects
  for select to authenticated
  using (user_id = auth.uid() or public.shares_module(user_id, auth.uid(), 'writing'));

create policy writing_projects_write on public.writing_projects
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.writing_projects to authenticated;
grant select on
  public.daily_module_measures,
  public.module_headline_unit,
  public.daily_module_totals,
  public.published_series,
  public.writing_project_totals
to authenticated;
