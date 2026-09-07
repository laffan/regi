-- Matches from USDA FoodData Central and Open Food Facts, kept so a repeated
-- meal does not re-hit either service. Written only by the edge functions.

create table public.food_cache (
  id               bigserial primary key,
  query            text not null,
  source           public.food_source not null,
  ref              text not null,
  name             text not null,
  brand            text,
  kcal_per_100g    numeric,
  kcal_per_serving numeric,
  serving_label    text,
  payload          jsonb not null default '{}'::jsonb,
  fetched_at       timestamptz not null default now(),
  constraint food_cache_unique_hit unique (source, ref, query)
);

create index food_cache_query_idx on public.food_cache (lower(query), source, fetched_at desc);
