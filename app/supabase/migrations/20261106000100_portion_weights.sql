-- Every food item keeps the weight its numbers are for, and where that weight
-- came from. "About a cup of yogurt" is priced as 245 g because USDA says a
-- cup weighs 245 g; "a handful of granola" as ≈ 30 g because that is an
-- estimate — and the log should be able to say which, not just the result.

alter table public.meal_items
  add column grams          numeric check (grams >= 0),
  add column portion_source text check (portion_source in ('stated', 'database', 'estimate', 'assumed'));

comment on column public.meal_items.grams is
  'The weight (or millilitres, for a drink) the energy and macros were computed for.';
comment on column public.meal_items.portion_source is
  'stated: the text gave the weight. database: a USDA/Open Food Facts portion weight. estimate: the parser''s or a typical weight. assumed: 100 g, nothing to go on.';

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
       protein_g, carbs_g, fat_g, fiber_g, grams, portion_source, position)
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
       nullif(item ->> 'grams', '')::numeric,
       case when item ->> 'portion_source' in ('stated', 'database', 'estimate', 'assumed')
            then item ->> 'portion_source' end,
       idx);
    idx := idx + 1;
  end loop;
end;
$$;

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
              'fat_g', mi.fat_g, 'fiber_g', mi.fiber_g,
              'grams', mi.grams, 'portion_source', mi.portion_source)
            order by mi.position)
       from public.meal_items mi
      where mi.entry_id = e.id),
    '[]'::jsonb
  ) as items
from public.entries e;

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
      'protein_g', mi.protein_g, 'carbs_g', mi.carbs_g, 'fat_g', mi.fat_g, 'fiber_g', mi.fiber_g,
      'grams', mi.grams, 'portion_source', mi.portion_source)
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
  select '20261106000100'::text;
$$;
