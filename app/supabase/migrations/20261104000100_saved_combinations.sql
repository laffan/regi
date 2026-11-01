-- Saved combinations (the `saved_meals` table) remember the logged entry they
-- were made from, so an entry's Edit panel can list — and remove — the
-- combinations taken from it. Deleting the entry keeps the combination.

alter table public.saved_meals
  add column source_entry_id uuid references public.entries (id) on delete set null;

comment on column public.saved_meals.source_entry_id is
  'The logged entry this combination was saved from, if any.';

create index saved_meals_source_idx on public.saved_meals (source_entry_id) where source_entry_id is not null;

-- The RPC records the link too.
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

  insert into public.saved_meals (user_id, name, detail, kcal, items, source_entry_id)
  values (auth.uid(), p_name, detail, total, items, p_entry_id)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.schema_version()
returns text
language sql
stable
as $$
  select '20261104000100'::text;
$$;
