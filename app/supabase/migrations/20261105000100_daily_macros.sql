-- One row per user and day with the macros of everything eaten, so the
-- calendar can draw the same mini macro bar the dashboard and the Log do
-- without fetching every item. `items` and `items_with_macros` let a reader
-- say "macros for 5 of 7 items" rather than present a partial sum as whole.

create view public.daily_macro_totals
with (security_invoker = on) as
select
  e.user_id,
  e.local_date,
  coalesce(sum(mi.protein_g), 0) as protein_g,
  coalesce(sum(mi.carbs_g), 0)   as carbs_g,
  coalesce(sum(mi.fat_g), 0)     as fat_g,
  coalesce(sum(mi.fiber_g), 0)   as fiber_g,
  count(mi.id)::int              as items,
  count(mi.id) filter (
    where mi.protein_g is not null or mi.carbs_g is not null
       or mi.fat_g is not null or mi.fiber_g is not null
  )::int                         as items_with_macros
from public.entries e
join public.meal_items mi on mi.entry_id = e.id
where e.module_slug = 'calories'
group by e.user_id, e.local_date;

grant select on public.daily_macro_totals to authenticated;

create or replace function public.schema_version()
returns text
language sql
stable
as $$
  select '20261105000100'::text;
$$;
