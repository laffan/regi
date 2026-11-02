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

-- Writing: one project, two units on the same day. The rollup must keep them
-- apart — 800 words and 25 minutes is not 825 of anything.
with p as (
  insert into public.writing_projects (user_id, title, kind, measure, target, target_kind)
  values (auth.uid(), 'The Lantern Room', 'Novel', 'words', 50000, 'total')
  returning id
)
insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload)
select auth.uid(), 'writing', '2026-09-07T09:05:00Z'::timestamptz, date '2026-09-07', 800, 'words',
       'The Lantern Room', jsonb_build_object('project_id', p.id)
  from p
union all
select auth.uid(), 'writing', '2026-09-07T07:00:00Z'::timestamptz, date '2026-09-07', 25, 'min',
       'Morning pages', jsonb_build_object('project_id', p.id)
  from p;

do $$
declare
  headline       numeric;
  headunit       text;
  sessions       int;
  unit_measures  jsonb;
  project_words  numeric;
  project_mins   numeric;
  words_series   numeric;
  minutes_series numeric;
begin
  select value, unit, entry_count, measures
    into headline, headunit, sessions, unit_measures
    from public.daily_module_totals
   where module_slug = 'writing' and local_date = '2026-09-07';

  if headunit <> 'words' then
    raise exception 'writing headline unit should follow the module setting, got %', headunit;
  end if;
  if headline <> 800 then
    raise exception 'headline value should be the words total, got %', headline;
  end if;
  if sessions <> 2 then
    raise exception 'both sessions should count towards the day, got %', sessions;
  end if;
  if (unit_measures ->> 'words')::numeric <> 800 or (unit_measures ->> 'min')::numeric <> 25 then
    raise exception 'measures should carry both units, got %', unit_measures;
  end if;

  select wpt.words, wpt.minutes into project_words, project_mins
    from public.writing_project_totals wpt
    join public.writing_projects wp on wp.id = wpt.project_id
   where wp.title = 'The Lantern Room';

  if project_words <> 800 or project_mins <> 25 then
    raise exception 'project totals wrong: % words, % minutes', project_words, project_mins;
  end if;

  select value into words_series from public.published_series
   where series = 'writing.words' and local_date = '2026-09-07';
  select value into minutes_series from public.published_series
   where series = 'writing.minutes' and local_date = '2026-09-07';

  if words_series <> 800 or minutes_series <> 25 then
    raise exception 'writing should publish one series per unit, got % / %', words_series, minutes_series;
  end if;
end
$$;

-- Switching the headline unit moves the leading number without touching data.
update public.user_modules
   set settings = settings || '{"measure":"min"}'::jsonb
 where module_slug = 'writing' and user_id = auth.uid();

do $$
declare
  headline numeric;
  headunit text;
begin
  select value, unit into headline, headunit
    from public.daily_module_totals
   where module_slug = 'writing' and local_date = '2026-09-07';

  if headunit <> 'min' or headline <> 25 then
    raise exception 'headline should follow the setting, got % %', headline, headunit;
  end if;
end
$$;

update public.user_modules
   set settings = settings || '{"measure":"words"}'::jsonb
 where module_slug = 'writing' and user_id = auth.uid();

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
  project_rows  int;
begin
  select count(*) into weight_rows  from public.entries where module_slug = 'weight';
  select count(*) into calorie_rows from public.entries where module_slug = 'calories';
  select count(*) into meal_rows    from public.meal_items;
  select count(*) into book_rows    from public.books;
  select count(*) into project_rows from public.writing_projects;

  if weight_rows = 0 then
    raise exception 'shared Weight entries are not visible to the connection';
  end if;
  if calorie_rows <> 0 or meal_rows <> 0 then
    raise exception 'Calories leaked on a Weight-only share';
  end if;
  if book_rows <> 0 then
    raise exception 'Reading leaked on a Weight-only share';
  end if;
  if project_rows <> 0 then
    raise exception 'Writing projects leaked on a Weight-only share';
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


-- ── feedback round ──────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- Macros and provenance travel with an item, and editing a meal re-sums it.
select public.log_meal(
  'Toast and eggs',
  '[{"name":"Sourdough toast","portion":"2 slices","kcal":220,"match_source":"usda","match_ref":"172687",
     "matched_name":"Bread, sourdough","basis":"2 × 110 kcal/serving","protein_g":8,"carbs_g":42,"fat_g":1.5,"fiber_g":2},
    {"name":"Eggs","portion":"2","kcal":140,"match_source":"openai","match_ref":"gpt-5.6-sol",
     "matched_name":"Large egg (estimate)","basis":"OpenAI estimate","protein_g":12,"carbs_g":1,"fat_g":10,"fiber_g":0}]'::jsonb,
  '2026-09-08T07:30:00Z'
) \gset toast_

do $$
declare
  total numeric;
  prot  numeric;
  src   text;
begin
  select value into total from public.entries where label = 'Toast and eggs';
  select sum(protein_g), string_agg(match_source::text, ',' order by position)
    into prot, src from public.meal_items mi join public.entries e on e.id = mi.entry_id
   where e.label = 'Toast and eggs';
  if total <> 360 or prot <> 20 or src <> 'usda,openai' then
    raise exception 'macros/provenance not stored: % kcal, % g protein, %', total, prot, src;
  end if;
  if (select items -> 1 ->> 'basis' from public.entry_feed where label = 'Toast and eggs') <> 'OpenAI estimate' then
    raise exception 'entry_feed does not carry the basis';
  end if;
end
$$;

select public.update_meal(
  :'toast_log_meal', 'Toast', '[{"name":"Sourdough toast","portion":"1 slice","kcal":110,"protein_g":4}]'::jsonb,
  '2026-09-08T07:45:00Z', date '2026-09-08', 'just the one');

do $$
begin
  if (select value from public.entries where label = 'Toast') <> 110 then
    raise exception 'update_meal did not re-sum';
  end if;
  if (select count(*) from public.meal_items mi join public.entries e on e.id = mi.entry_id where e.label = 'Toast') <> 1 then
    raise exception 'update_meal did not replace the items';
  end if;
end
$$;

-- A draft's macros survive approval.
with d as (
  insert into public.log_drafts (user_id, raw_text) values (auth.uid(), 'two eggs') returning id
)
insert into public.log_draft_rows (draft_id, user_id, module_slug, label, value, unit, occurred_at, payload)
select d.id, auth.uid(), 'calories', 'Eggs', 140, 'kcal', '2026-09-08T08:30:00Z'::timestamptz,
       '{"items":[{"name":"Eggs","portion":"2","kcal":140,"match_source":"openai","match_ref":"m",
                   "basis":"OpenAI estimate","protein_g":12,"carbs_g":1,"fat_g":10,"fiber_g":0}]}'::jsonb
  from d;
select public.approve_draft((select id from public.log_drafts where raw_text = 'two eggs'));
do $$
begin
  if (select (items -> 0 ->> 'protein_g')::numeric from public.entry_feed where label = 'Eggs') <> 12 then
    raise exception 'approve_draft dropped the macros';
  end if;
end
$$;

-- Time zone: a never-set account takes the device's zone and re-dates history.
select public.set_time_zone('America/Los_Angeles');
do $$
begin
  if (select time_zone from public.profiles where id = auth.uid()) <> 'America/Los_Angeles' then
    raise exception 'set_time_zone did not store the zone';
  end if;
  -- Toast is at 07:45Z, which is 00:45 PDT: still the 8th.
  if (select local_date from public.entries where label = 'Toast') <> date '2026-09-08' then
    raise exception 'Toast (07:45Z = 00:45 PDT) should stay on the 8th';
  end if;
  if (select local_date from public.entries where label = 'Eggs') <> date '2026-09-08' then
    raise exception 'Eggs (08:30Z = 01:30 PDT) should stay on the 8th';
  end if;
  if (select local_date from public.entries where module_slug = 'weight' limit 1) <> date '2026-09-06' then
    raise exception 'a 06:40Z weigh-in should re-date to the 6th in Los Angeles';
  end if;
end
$$;
select public.set_time_zone('Europe/Paris');
do $$
begin
  if (select local_date from public.entries where module_slug = 'weight' limit 1) <> date '2026-09-06' then
    raise exception 'a second zone change must not re-date history';
  end if;
end
$$;

-- A saved combination remembers its entry, and outlives it.
select public.save_meal_from_entry(:'toast_log_meal', 'Toast combo') \gset combo_
do $$
begin
  if (select source_entry_id from public.saved_meals where name = 'Toast combo') is null then
    raise exception 'saved combination should record its entry';
  end if;
end
$$;

-- Per-day macros: the eggs approved above (12 g protein) land in the rollup.
do $$
begin
  if (select protein_g from public.daily_macro_totals
       where user_id = auth.uid() and local_date = date '2026-09-08') < 12 then
    raise exception 'daily_macro_totals missed the day''s protein';
  end if;
end
$$;

-- An item keeps the weight it was priced for, and where the weight came from.
select public.log_meal('Yogurt and granola',
  '[{"name":"Greek yogurt","portion":"about a cup","kcal":149,"match_source":"usda","match_ref":"1",
     "grams":245,"portion_source":"database"},
    {"name":"Granola","portion":"a handful","kcal":141,"match_source":"usda","match_ref":"2",
     "grams":30,"portion_source":"estimate"},
    {"name":"Oops","kcal":1,"portion_source":"guess"}]'::jsonb,
  '2026-09-08T09:00:00Z');
do $$
begin
  if (select items -> 0 ->> 'grams' from public.entry_feed where label = 'Yogurt and granola') <> '245'
     or (select items -> 1 ->> 'portion_source' from public.entry_feed where label = 'Yogurt and granola') <> 'estimate' then
    raise exception 'portion weight or source not kept';
  end if;
  if (select items -> 2 ->> 'portion_source' from public.entry_feed where label = 'Yogurt and granola') is not null then
    raise exception 'an unknown portion source should be dropped, not stored';
  end if;
end
$$;

-- Closing a day.
insert into public.day_closures (user_id, module_slug, local_date) values (auth.uid(), 'calories', '2026-09-08');

-- A tracker of one's own: created active, logged, rolled up, removable.
select public.create_activity_module('Stretch', 'activity',
  '[["path",{"d":"M22 12h-4l-3 9L9 3l-3 9H2"}]]'::jsonb) \gset act_

insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label)
values (auth.uid(), :'act_create_activity_module', '2026-09-08T08:00:00Z', '2026-09-08', 1, 'done', 'Stretch');

do $$
declare
  slug text := (select m.slug from public.modules m where m.name = 'Stretch');
begin
  if not (select active from public.user_modules where module_slug = slug and user_id = auth.uid()) then
    raise exception 'new tracker should be active';
  end if;
  if (select value from public.daily_module_totals where module_slug = slug and local_date = '2026-09-08') <> 1 then
    raise exception 'tracker day did not roll up';
  end if;
end
$$;

-- Bo cannot see Ana's tracker, and cannot create one in her name.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if exists (select 1 from public.modules where kind = 'activity') then
    raise exception 'another account''s tracker is visible';
  end if;
end
$$;

-- Presence-only sharing: Bo learns that Ana logged Calories, never the number.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.set_module_share_level(:'conn_request_connection', 'calories', 'presence');
select public.set_module_share_level(:'conn_request_connection', :'act_create_activity_module', 'full');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare
  rows_seen int;
  leaked    int;
begin
  if (select count(*) from public.entries where module_slug = 'calories') <> 0
     or (select count(*) from public.meal_items) <> 0 then
    raise exception 'a presence share exposed calorie rows';
  end if;

  select count(*), count(*) filter (where value is not null)
    into rows_seen, leaked
    from public.shared_daily_totals('2026-09-01', '2026-09-30')
   where module_slug = 'calories';
  if rows_seen = 0 then
    raise exception 'presence share shows no logged days';
  end if;
  if leaked <> 0 then
    raise exception 'presence share leaked a calorie total';
  end if;

  if not exists (select 1 from public.modules where kind = 'activity') then
    raise exception 'a shared tracker should be readable by name';
  end if;
  if (select value from public.shared_daily_totals('2026-09-01', '2026-09-30')
       where module_slug like 'act-%' limit 1) <> 1 then
    raise exception 'full tracker share should carry its value';
  end if;
end
$$;

-- Bo mutes Ana's Calories: gone from what he receives, still granted by her.
select public.set_receive(:'conn_request_connection', 'calories', false);
do $$
begin
  if exists (select 1 from public.shared_daily_totals('2026-09-01', '2026-09-30') where module_slug = 'calories') then
    raise exception 'muted module still received';
  end if;
  if (select they_share_detail ->> 'calories' from public.my_connections) <> 'presence' then
    raise exception 'my_connections should still report the grant and its level';
  end if;
  if not exists (select 1 from public.my_connections where 'calories' = any (i_mute)) then
    raise exception 'my_connections should report the mute';
  end if;
end
$$;

-- Removing the tracker takes its entries and grants with it.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.delete_activity_module(:'act_create_activity_module');
do $$
begin
  if exists (select 1 from public.modules where kind = 'activity')
     or exists (select 1 from public.entries where module_slug like 'act-%') then
    raise exception 'tracker not fully removed';
  end if;
end
$$;

rollback;

\echo '  smoke: schema, triggers, rollups, drafts, trackers, macros and sharing levels all behave'
