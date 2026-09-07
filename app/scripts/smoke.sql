-- Exercises the parts of the schema that are easy to get wrong: the new-user
-- trigger, the meal re-sum, book advance, the daily rollup, and per-module
-- sharing under RLS. Run through validate-migrations.sh.
\set ON_ERROR_STOP on
\set QUIET on

begin;

-- Two accounts. The trigger should give each a profile and six module rows.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bo@example.com');

do $$
begin
  if (select count(*) from public.profiles
       where id in ('11111111-1111-1111-1111-111111111111',
                    '22222222-2222-2222-2222-222222222222')) <> 2 then
    raise exception 'handle_new_user did not create both profiles';
  end if;
  if (select count(*) from public.user_modules
       where user_id = '11111111-1111-1111-1111-111111111111') <> 6 then
    raise exception 'default modules missing';
  end if;
  if (select count(*) from public.user_modules
       where user_id = '11111111-1111-1111-1111-111111111111' and active) <> 3 then
    raise exception 'expected weight, calories and reading active by default';
  end if;
end
$$;

-- Ana logs a weigh-in, a meal and some reading.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.entries (user_id, module_slug, occurred_at, value, unit, label)
values (auth.uid(), 'weight', '2026-09-07T06:40:00Z', 182.4, 'lb', '182.4');

select public.log_meal(
  'Oats, banana, coffee',
  '[{"name":"Rolled oats","portion":"80 g","kcal":304,"match_source":"usda","match_ref":"169705"},
    {"name":"Banana","portion":"1 medium","kcal":105,"match_source":"usda","match_ref":"173944"}]'::jsonb,
  '2026-09-07T07:10:00Z'
) \gset meal_

with b as (
  insert into public.books (user_id, title, author, total_pages, current_page, started_on)
  values (auth.uid(), 'The Overstory', 'Richard Powers', 502, 190, '2026-08-14')
  returning id
)
insert into public.entries (user_id, module_slug, occurred_at, value, unit, label, payload)
select auth.uid(), 'reading', '2026-09-07T13:05:00Z', 24, 'pages', 'Read on the porch',
       jsonb_build_object('book_id', b.id, 'end_page', 214)
  from b;

do $$
declare
  meal_total numeric;
  page       int;
  day_kcal   numeric;
  day_weight numeric;
begin
  select value into meal_total from public.entries
   where module_slug = 'calories' and label = 'Oats, banana, coffee';
  if meal_total <> 409 then
    raise exception 'meal re-sum wrong: %', meal_total;
  end if;

  select current_page into page from public.books where title = 'The Overstory';
  if page <> 214 then
    raise exception 'book did not advance: %', page;
  end if;

  select value into day_kcal from public.daily_module_totals
   where module_slug = 'calories' and local_date = '2026-09-07';
  if day_kcal <> 409 then
    raise exception 'calories should sum for the day: %', day_kcal;
  end if;

  select value into day_weight from public.daily_module_totals
   where module_slug = 'weight' and local_date = '2026-09-07';
  if day_weight <> 182.4 then
    raise exception 'weight should be the last reading: %', day_weight;
  end if;
end
$$;

-- Text in → draft → approve → entries.
with d as (
  insert into public.log_drafts (user_id, raw_text, parser)
  values (auth.uid(), 'grilled chicken salad and an iced tea, read 18 pages', 'fallback')
  returning id
)
insert into public.log_draft_rows (draft_id, user_id, module_slug, label, value, unit, occurred_at, payload, match_note, position)
select d.id, auth.uid(), 'calories', 'Grilled chicken salad, iced tea', 522, 'kcal',
       '2026-09-07T18:45:00Z'::timestamptz,
       '{"items":[{"name":"Grilled chicken salad","kcal":520,"match_source":"usda","match_ref":"171534"},
                  {"name":"Iced tea, unsweetened","kcal":2,"match_source":"off","match_ref":"0074780"}]}'::jsonb,
       'USDA · 2 matches', 0
  from d
union all
select d.id, auth.uid(), 'reading', 'The Overstory', 18, 'pages',
       '2026-09-07T21:30:00Z'::timestamptz,
       jsonb_build_object('book_id', (select id from public.books where title = 'The Overstory'),
                          'end_page', 232),
       'current book assumed', 1
  from d;

select public.approve_draft((select id from public.log_drafts where user_id = auth.uid() limit 1));

do $$
declare
  n     int;
  page  int;
  items int;
begin
  select count(*) into n from public.entries where source = 'log';
  if n <> 2 then
    raise exception 'approve_draft should have written 2 entries, wrote %', n;
  end if;

  select count(*) into items from public.meal_items mi
    join public.entries e on e.id = mi.entry_id
   where e.source = 'log';
  if items <> 2 then
    raise exception 'meal items did not carry across: %', items;
  end if;

  select current_page into page from public.books where title = 'The Overstory';
  if page <> 232 then
    raise exception 'approved reading row did not advance the book: %', page;
  end if;

  if (select status from public.log_drafts limit 1) <> 'approved' then
    raise exception 'draft not closed';
  end if;
end
$$;

-- Bo can see nothing of Ana's yet.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if (select count(*) from public.entries) <> 0 then
    raise exception 'entries leaked to an unconnected account';
  end if;
end
$$;

-- Ana connects to Bo and shares Weight only.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.request_connection('bo@example.com') \gset conn_

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select public.respond_to_connection(:'conn_request_connection', true);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.set_module_share(:'conn_request_connection', 'weight', true);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare
  weight_rows   int;
  calorie_rows  int;
  meal_rows     int;
  book_rows     int;
begin
  select count(*) into weight_rows  from public.entries where module_slug = 'weight';
  select count(*) into calorie_rows from public.entries where module_slug = 'calories';
  select count(*) into meal_rows    from public.meal_items;
  select count(*) into book_rows    from public.books;

  if weight_rows = 0 then
    raise exception 'shared Weight entries are not visible to the connection';
  end if;
  if calorie_rows <> 0 or meal_rows <> 0 then
    raise exception 'Calories leaked on a Weight-only share';
  end if;
  if book_rows <> 0 then
    raise exception 'Reading leaked on a Weight-only share';
  end if;
end
$$;

-- Withdrawing the grant takes the data back.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.set_module_share(:'conn_request_connection', 'weight', false);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if (select count(*) from public.entries) <> 0 then
    raise exception 'revoked share still readable';
  end if;
end
$$;

rollback;

\echo '  smoke: schema, triggers, rollups, drafts and per-module sharing all behave'
