-- The first round of feedback, server side.
--
--   · appearance       a per-account highlight colour, cornflower by default
--   · calories         macros and provenance on every item, OpenAI estimates as
--                      a labelled source, "Log food", editing a logged meal,
--                      and closing a day after its last meal
--   · activity modules user-made trackers that record "I did" for a day
--   · sharing          each grant is full detail or presence only, and the
--                      receiving side can hide what it does not want to see

-- ── appearance ──────────────────────────────────────────────────────────────
alter table public.profiles
  add column accent_color text not null default '#6495ED'
  constraint profiles_accent_hex check (accent_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.profiles.accent_color is
  'The highlight colour, as #RRGGBB. Clients derive their lighter and deeper shades from it.';

-- ── calories: macros and provenance ─────────────────────────────────────────
-- An item records not just its number but how the number was reached: what it
-- was matched to, and the arithmetic ("80 g at 380 kcal / 100 g"). A figure
-- with no basis is one the user set by hand.
alter table public.meal_items
  add column matched_name text,
  add column basis        text,
  add column protein_g    numeric check (protein_g >= 0),
  add column carbs_g      numeric check (carbs_g >= 0),
  add column fat_g        numeric check (fat_g >= 0),
  add column fiber_g      numeric check (fiber_g >= 0);

comment on column public.meal_items.matched_name is
  'The database entry (or estimate) the item was priced against, e.g. "Yogurt, Greek, plain, nonfat".';
comment on column public.meal_items.basis is
  'How kcal was computed from the match, e.g. "80 g × 380 kcal/100 g". Null for a figure set by hand.';
comment on column public.meal_items.carbs_g is
  'Total carbohydrate, fibre included, as food labels and USDA report it.';

update public.modules set log_label = 'Log food' where slug = 'calories';

-- Every path that writes meal items goes through here, so the columns cannot
-- drift between logging, approving a draft and re-logging a saved meal.
create or replace function public.insert_meal_items(p_entry_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  idx  int := 0;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.meal_items
      (entry_id, user_id, name, portion, kcal, match_source, match_ref, matched_name, basis,
       protein_g, carbs_g, fat_g, fiber_g, position)
    values
      (p_entry_id, auth.uid(),
       coalesce(nullif(item ->> 'name', ''), 'Item'),
       nullif(item ->> 'portion', ''),
       coalesce(nullif(item ->> 'kcal', '')::numeric, 0),
       coalesce(nullif(item ->> 'match_source', '')::public.food_source, 'manual'),
       nullif(item ->> 'match_ref', ''),
       nullif(item ->> 'matched_name', ''),
       nullif(item ->> 'basis', ''),
       nullif(item ->> 'protein_g', '')::numeric,
       nullif(item ->> 'carbs_g', '')::numeric,
       nullif(item ->> 'fat_g', '')::numeric,
       nullif(item ->> 'fiber_g', '')::numeric,
       idx);
    idx := idx + 1;
  end loop;
end;
$$;

create or replace function public.approve_draft(p_draft_id uuid)
returns setof uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r        public.log_draft_rows%rowtype;
  new_id   uuid;
  d_status public.draft_status;
begin
  select status into d_status
    from public.log_drafts
   where id = p_draft_id and user_id = auth.uid()
   for update;

  if d_status is null then
    raise exception 'draft not found';
  end if;
  if d_status <> 'pending' then
    raise exception 'draft already %', d_status;
  end if;

  for r in
    select * from public.log_draft_rows
     where draft_id = p_draft_id and user_id = auth.uid()
     order by position
  loop
    insert into public.entries
      (user_id, module_slug, occurred_at, value, unit, label, note, payload, source)
    values
      (auth.uid(), r.module_slug, r.occurred_at, r.value, r.unit, r.label,
       nullif(r.payload ->> 'note', ''),
       r.payload - 'items' - 'note',
       'log')
    returning id into new_id;

    if jsonb_typeof(r.payload -> 'items') = 'array' then
      perform public.insert_meal_items(new_id, r.payload -> 'items');
    end if;

    return next new_id;
  end loop;

  update public.log_drafts
     set status = 'approved', resolved_at = now()
   where id = p_draft_id and user_id = auth.uid();
end;
$$;

create or replace function public.log_meal(
  p_label       text,
  p_items       jsonb,
  p_occurred_at timestamptz default now(),
  p_source      public.entry_source default 'manual'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.entries (user_id, module_slug, occurred_at, value, unit, label, source)
  values (auth.uid(), 'calories', p_occurred_at, 0, 'kcal', p_label, p_source)
  returning id into new_id;

  perform public.insert_meal_items(new_id, p_items);
  return new_id;
end;
$$;

-- Editing a logged meal replaces its items in one step; the re-sum trigger
-- keeps the headline equal to the lines, as it does for a new meal.
create or replace function public.update_meal(
  p_entry_id    uuid,
  p_label       text,
  p_items       jsonb,
  p_occurred_at timestamptz,
  p_local_date  date default null,
  p_note        text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.entries
     set label       = p_label,
         occurred_at = p_occurred_at,
         local_date  = coalesce(p_local_date, local_date),
         note        = nullif(p_note, '')
   where id = p_entry_id and user_id = auth.uid() and module_slug = 'calories';

  if not found then
    raise exception 'meal not found';
  end if;

  delete from public.meal_items where entry_id = p_entry_id and user_id = auth.uid();
  perform public.insert_meal_items(p_entry_id, p_items);

  -- A meal edited down to no items still has to read zero, not its old total.
  update public.entries
     set value = coalesce((select sum(kcal) from public.meal_items where entry_id = p_entry_id), 0)
   where id = p_entry_id;
end;
$$;

create or replace function public.save_meal_from_entry(
  p_entry_id uuid,
  p_name     text,
  p_item_ids uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
  items  jsonb;
  detail text;
  total  numeric;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'name', mi.name, 'portion', mi.portion, 'kcal', mi.kcal,
      'match_source', mi.match_source, 'match_ref', mi.match_ref,
      'matched_name', mi.matched_name, 'basis', mi.basis,
      'protein_g', mi.protein_g, 'carbs_g', mi.carbs_g, 'fat_g', mi.fat_g, 'fiber_g', mi.fiber_g)
      order by mi.position), '[]'::jsonb),
    string_agg(mi.name || coalesce(' ' || mi.portion, ''), ' · ' order by mi.position),
    coalesce(sum(mi.kcal), 0)
  into items, detail, total
  from public.meal_items mi
  where mi.entry_id = p_entry_id
    and mi.user_id = auth.uid()
    and (p_item_ids is null or mi.id = any (p_item_ids));

  insert into public.saved_meals (user_id, name, detail, kcal, items)
  values (auth.uid(), p_name, detail, total, items)
  returning id into new_id;

  return new_id;
end;
$$;

-- The log feed carries the new item columns.
create or replace view public.entry_feed
with (security_invoker = on) as
select
  e.id,
  e.user_id,
  e.module_slug,
  e.occurred_at,
  e.local_date,
  e.value,
  e.unit,
  e.label,
  e.note,
  e.payload,
  e.source,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'id', mi.id, 'name', mi.name, 'portion', mi.portion, 'kcal', mi.kcal,
              'match_source', mi.match_source, 'match_ref', mi.match_ref,
              'matched_name', mi.matched_name, 'basis', mi.basis,
              'protein_g', mi.protein_g, 'carbs_g', mi.carbs_g,
              'fat_g', mi.fat_g, 'fiber_g', mi.fiber_g)
            order by mi.position)
       from public.meal_items mi
      where mi.entry_id = e.id),
    '[]'::jsonb
  ) as items
from public.entries e;

-- ── reading: an edited session still moves the book ─────────────────────────
-- Progress only ever advances; editing a session down does not wind the book
-- back, because the page you reached is still the page you reached.
drop trigger if exists reading_advance_book on public.entries;
create trigger reading_advance_book
  after insert or update of payload on public.entries
  for each row execute function public.reading_advance_book();

-- ── closing a day ───────────────────────────────────────────────────────────
-- "Last meal of the day": the day's count is complete, so it can be read as a
-- finished number rather than one still filling up.
create table public.day_closures (
  user_id     uuid not null references auth.users (id) on delete cascade,
  module_slug text not null references public.modules (slug) on delete cascade,
  local_date  date not null,
  closed_at   timestamptz not null default now(),
  primary key (user_id, module_slug, local_date)
);

comment on table public.day_closures is
  'A module day the user has marked complete — Calories after the last meal.';

-- ── activity modules ────────────────────────────────────────────────────────
-- A module a person makes for themselves: a name, an icon, and one question a
-- day — did you? A day with an entry is a day they did; there is no entry for
-- "not today". Built-in modules have no owner.
alter table public.modules
  add column owner_id   uuid references auth.users (id) on delete cascade,
  add column kind       text not null default 'builtin' check (kind in ('builtin', 'activity')),
  add column icon_nodes jsonb,
  add constraint modules_activity_owned check ((kind = 'activity') = (owner_id is not null));

comment on column public.modules.icon_nodes is
  'Activity modules: the icon''s SVG elements as [[tag, {attrs}], …] on a 24×24 grid, so any client can draw it without the icon library.';

create index modules_owner_idx on public.modules (owner_id) where owner_id is not null;

create or replace function public.create_activity_module(
  p_name       text,
  p_icon       text,
  p_icon_nodes jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  v_slug  text;
  v_name  text := trim(coalesce(p_name, ''));
  v_pos   int;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if length(v_name) = 0 or length(v_name) > 40 then
    raise exception 'a name between 1 and 40 characters, please';
  end if;
  if p_icon is null or p_icon !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'unknown icon';
  end if;
  if p_icon_nodes is null or jsonb_typeof(p_icon_nodes) <> 'array' or octet_length(p_icon_nodes::text) > 8000 then
    raise exception 'icon geometry missing or too large';
  end if;
  if (select count(*) from public.modules where owner_id = me) >= 40 then
    raise exception 'that is a lot of trackers — remove one first';
  end if;

  v_slug := 'act-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  insert into public.modules
    (slug, name, icon, unit, value_kind, primary_series, publishes, subscribes, log_label,
     sort_order, owner_id, kind, icon_nodes)
  values
    (v_slug, v_name, p_icon, 'done', 'last', 'activity.' || v_slug,
     array['activity.' || v_slug], '{}', 'I did!', 100, me, 'activity', p_icon_nodes);

  select coalesce(max(position), 0) + 10 into v_pos from public.user_modules where user_id = me;

  insert into public.user_modules (user_id, module_slug, active, position, settings)
  values (me, v_slug, true, v_pos, '{}'::jsonb);

  return v_slug;
end;
$$;

create or replace function public.update_activity_module(
  p_slug       text,
  p_name       text,
  p_icon       text,
  p_icon_nodes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
begin
  if length(v_name) = 0 or length(v_name) > 40 then
    raise exception 'a name between 1 and 40 characters, please';
  end if;
  if p_icon is null or p_icon !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'unknown icon';
  end if;
  if p_icon_nodes is null or jsonb_typeof(p_icon_nodes) <> 'array' or octet_length(p_icon_nodes::text) > 8000 then
    raise exception 'icon geometry missing or too large';
  end if;

  update public.modules
     set name = v_name, icon = p_icon, icon_nodes = p_icon_nodes
   where slug = p_slug and owner_id = auth.uid() and kind = 'activity';

  if not found then
    raise exception 'tracker not found';
  end if;
end;
$$;

-- Removing a tracker removes what was recorded in it. Turning it off (an
-- ordinary user_modules update) is the way to keep the history.
create or replace function public.delete_activity_module(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.modules where slug = p_slug and owner_id = auth.uid() and kind = 'activity'
  ) then
    raise exception 'tracker not found';
  end if;

  delete from public.log_draft_rows where module_slug = p_slug and user_id = auth.uid();
  delete from public.entries        where module_slug = p_slug and user_id = auth.uid();
  delete from public.modules        where slug = p_slug and owner_id = auth.uid();
end;
$$;

-- ── sharing: detail levels and receiving ────────────────────────────────────
-- "full" shares the numbers, labels and notes. "presence" shares only that a
-- day was logged — the viewer sees a tick, never the value.
alter table public.connection_shares
  add column detail text not null default 'full' check (detail in ('full', 'presence'));

comment on column public.connection_shares.detail is
  '"full": values, labels and notes. "presence": only whether a day was logged.';

-- Row-level reads of entries, meal items, books and projects need a full
-- grant; presence is served by shared_daily_totals() alone.
create or replace function public.shares_module(p_owner uuid, p_viewer uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.connections c
      join public.connection_shares s on s.connection_id = c.id
     where c.status = 'active'
       and s.owner_id = p_owner
       and s.module_slug = p_module
       and s.detail = 'full'
       and (
         (c.requester_id = p_owner and c.addressee_id = p_viewer) or
         (c.addressee_id = p_owner and c.requester_id = p_viewer)
       )
  );
$$;

create or replace function public.shares_presence(p_owner uuid, p_viewer uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.connections c
      join public.connection_shares s on s.connection_id = c.id
     where c.status = 'active'
       and s.owner_id = p_owner
       and s.module_slug = p_module
       and (
         (c.requester_id = p_owner and c.addressee_id = p_viewer) or
         (c.addressee_id = p_owner and c.requester_id = p_viewer)
       )
  );
$$;

-- The receiving side: a module someone shares with you that you would rather
-- not see. Muting is yours alone and does not change what they grant.
create table public.connection_mutes (
  connection_id uuid not null references public.connections (id) on delete cascade,
  viewer_id     uuid not null references auth.users (id) on delete cascade,
  module_slug   text not null references public.modules (slug) on delete cascade,
  muted_at      timestamptz not null default now(),
  primary key (connection_id, viewer_id, module_slug)
);

create or replace function public.set_module_share_level(
  p_connection_id uuid,
  p_module_slug   text,
  p_level         text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_level not in ('none', 'presence', 'full') then
    raise exception 'level must be none, presence or full';
  end if;

  if p_level = 'none' then
    delete from public.connection_shares
     where connection_id = p_connection_id
       and owner_id = auth.uid()
       and module_slug = p_module_slug;
  else
    insert into public.connection_shares (connection_id, owner_id, module_slug, detail)
    values (p_connection_id, auth.uid(), p_module_slug, p_level)
    on conflict (connection_id, owner_id, module_slug) do update set detail = excluded.detail;
  end if;
end;
$$;

-- Kept for older clients: a grant is a full share, a revoke is none.
create or replace function public.set_module_share(
  p_connection_id uuid,
  p_module_slug   text,
  p_granted       boolean
)
returns void
language sql
security invoker
set search_path = public
as $$
  select public.set_module_share_level(
    p_connection_id, p_module_slug, case when p_granted then 'full' else 'none' end);
$$;

create or replace function public.set_receive(
  p_connection_id uuid,
  p_module_slug   text,
  p_show          boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_show then
    delete from public.connection_mutes
     where connection_id = p_connection_id
       and viewer_id = auth.uid()
       and module_slug = p_module_slug;
  else
    insert into public.connection_mutes (connection_id, viewer_id, module_slug)
    values (p_connection_id, auth.uid(), p_module_slug)
    on conflict do nothing;
  end if;
end;
$$;

-- Everything shared with the caller, one row per person / day / module, with
-- the number left out where the grant is presence only and muted modules
-- dropped. Security definer because a presence grant gives no row access.
create or replace function public.shared_daily_totals(p_from date, p_to date)
returns table (
  owner_id    uuid,
  local_date  date,
  module_slug text,
  detail      text,
  entry_count int,
  value       numeric,
  unit        text,
  measures    jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.user_id,
    d.local_date,
    d.module_slug,
    s.detail,
    d.entry_count,
    case when s.detail = 'full' then d.value end,
    case when s.detail = 'full' then d.unit end,
    case when s.detail = 'full' then d.measures end
  from public.connections c
  join public.connection_shares s on s.connection_id = c.id
  join public.daily_module_totals d
    on d.user_id = s.owner_id and d.module_slug = s.module_slug
  where c.status = 'active'
    and auth.uid() in (c.requester_id, c.addressee_id)
    and s.owner_id <> auth.uid()
    and d.local_date between p_from and p_to
    and not exists (
      select 1 from public.connection_mutes m
       where m.connection_id = c.id
         and m.viewer_id = auth.uid()
         and m.module_slug = s.module_slug
    );
$$;

-- The Sharing screen's view, now carrying levels and mutes. New columns are
-- appended so existing readers keep working.
create or replace view public.my_connections
with (security_invoker = on) as
select
  c.id,
  c.status,
  c.created_at,
  c.requester_id,
  c.addressee_id,
  case when c.requester_id = auth.uid() then c.addressee_id else c.requester_id end as other_id,
  (c.requester_id = auth.uid())                                                     as i_requested,
  coalesce(
    (select array_agg(s.module_slug order by s.module_slug)
       from public.connection_shares s
      where s.connection_id = c.id and s.owner_id = auth.uid()),
    '{}'
  ) as i_share,
  coalesce(
    (select array_agg(s.module_slug order by s.module_slug)
       from public.connection_shares s
      where s.connection_id = c.id and s.owner_id <> auth.uid()),
    '{}'
  ) as they_share,
  coalesce(
    (select jsonb_object_agg(s.module_slug, s.detail)
       from public.connection_shares s
      where s.connection_id = c.id and s.owner_id = auth.uid()),
    '{}'::jsonb
  ) as i_share_detail,
  coalesce(
    (select jsonb_object_agg(s.module_slug, s.detail)
       from public.connection_shares s
      where s.connection_id = c.id and s.owner_id <> auth.uid()),
    '{}'::jsonb
  ) as they_share_detail,
  coalesce(
    (select array_agg(m.module_slug order by m.module_slug)
       from public.connection_mutes m
      where m.connection_id = c.id and m.viewer_id = auth.uid()),
    '{}'
  ) as i_mute
from public.connections c
where c.requester_id = auth.uid() or c.addressee_id = auth.uid();

-- ── calories: OpenAI as a source ────────────────────────────────────────────
-- Databases first, an estimate only when neither has the food. Accounts still
-- on the old default pick up the new one; a customised order is left alone.
update public.user_modules
   set settings = jsonb_set(settings, '{source_order}', '["usda","off","openai"]'::jsonb)
 where module_slug = 'calories'
   and settings -> 'source_order' = '["usda","off"]'::jsonb;

update public.user_modules
   set settings = jsonb_set(settings, '{source_order}', '["off","usda","openai"]'::jsonb)
 where module_slug = 'calories'
   and settings -> 'source_order' = '["off","usda"]'::jsonb;

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
     '{"source_order":["usda","off","openai"],"daily_target":2200}'::jsonb),
    (new.id, 'reading',  true,  30, '{}'::jsonb),
    (new.id, 'running',  false, 40, '{}'::jsonb),
    (new.id, 'writing',  false, 50, '{"measure":"words"}'::jsonb),
    (new.id, 'sleep',    false, 60, '{}'::jsonb)
  on conflict do nothing;

  return new;
end;
$$;

-- ── access ──────────────────────────────────────────────────────────────────
alter table public.day_closures     enable row level security;
alter table public.connection_mutes enable row level security;

-- The catalog: built-ins for everyone, your own trackers, and trackers someone
-- shares with you (at any level, so the tick has a name and an icon).
drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules
  for select to authenticated
  using (
    owner_id is null
    or owner_id = auth.uid()
    or public.shares_presence(owner_id, auth.uid(), slug)
  );

create policy day_closures_read on public.day_closures
  for select to authenticated
  using (user_id = auth.uid() or public.shares_module(user_id, auth.uid(), module_slug));

create policy day_closures_write on public.day_closures
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy connection_mutes_own on public.connection_mutes
  for all to authenticated
  using (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.connections c
       where c.id = connection_mutes.connection_id
         and auth.uid() in (c.requester_id, c.addressee_id)
    )
  )
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.connections c
       where c.id = connection_mutes.connection_id
         and auth.uid() in (c.requester_id, c.addressee_id)
    )
  );

grant select, insert, update, delete on public.day_closures, public.connection_mutes to authenticated;

revoke all on function
  public.create_activity_module(text, text, jsonb),
  public.update_activity_module(text, text, text, jsonb),
  public.delete_activity_module(text),
  public.shared_daily_totals(date, date)
from public;

grant execute on function
  public.insert_meal_items(uuid, jsonb),
  public.update_meal(uuid, text, jsonb, timestamptz, date, text),
  public.create_activity_module(text, text, jsonb),
  public.update_activity_module(text, text, text, jsonb),
  public.delete_activity_module(text),
  public.shares_presence(uuid, uuid, text),
  public.set_module_share_level(uuid, text, text),
  public.set_receive(uuid, text, boolean),
  public.shared_daily_totals(date, date)
to authenticated;
