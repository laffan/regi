-- Rollups the three surfaces share. `security_invoker` keeps the caller's RLS,
-- so a connection sees exactly the modules shared with them and nothing else.

-- One row per user / day / module: the number the week strip, the calendar day
-- line and the months grid all read.
create view public.daily_module_totals
with (security_invoker = on) as
select
  e.user_id,
  e.local_date,
  e.module_slug,
  case
    when m.value_kind = 'sum' then sum(e.value)
    else (array_agg(e.value order by e.occurred_at desc))[1]
  end                       as value,
  m.unit,
  count(*)                  as entry_count,
  max(e.occurred_at)        as last_at
from public.entries e
join public.modules m on m.slug = e.module_slug
where e.value is not null
group by e.user_id, e.local_date, e.module_slug, m.value_kind, m.unit;

-- The crosstalk surface: a module publishes a named series, any widget reads it.
-- The Weight × Calories chart owns neither series it draws.
create view public.published_series
with (security_invoker = on) as
select
  d.user_id,
  d.local_date,
  m.primary_series as series,
  d.module_slug,
  d.value,
  d.unit
from public.daily_module_totals d
join public.modules m on m.slug = d.module_slug;

-- The log feed, with the meal breakdown folded in so one query fills the screen.
create view public.entry_feed
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
              'match_source', mi.match_source, 'match_ref', mi.match_ref)
            order by mi.position)
       from public.meal_items mi
      where mi.entry_id = e.id),
    '[]'::jsonb
  ) as items
from public.entries e;

-- Everything a connection has granted the caller, for the "shared with you"
-- column in Settings → Sharing.
create view public.my_connections
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
  ) as they_share
from public.connections c
where c.requester_id = auth.uid() or c.addressee_id = auth.uid();
