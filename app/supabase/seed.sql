-- Demo data: the account the designs were drawn against, plus the two
-- connections and one pending request from the Sharing screen.
--
--   you@trackalack.test / trackalack   ← the account in every screenshot
--   marcus@example.com, priya@example.com, jules@example.com (same password)
--
-- The designs were drawn on Monday 2026-09-07. The seed lands that day's numbers
-- on whatever day it runs (Pacific time), and moves every other date by the same
-- amount, so the demo always opens on a full current week. Weight and Calories
-- carry ~13 weeks; Reading covers two books.

-- Hosted projects keep pgcrypto (crypt, gen_salt) in the extensions schema.
set search_path = public, extensions;

-- ── accounts ────────────────────────────────────────────────────────────────
-- The token columns are empty strings, not nulls: Supabase Auth cannot read a
-- user whose tokens are null, and the sign-in fails with "Database error".
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'you@trackalack.test',
   crypt('trackalack', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Nick Laffan"}',
   now() - interval '98 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'marcus@example.com',
   crypt('trackalack', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Marcus Reid"}',
   now() - interval '95 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'priya@example.com',
   crypt('trackalack', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Priya Raman"}',
   now() - interval '88 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'jules@example.com',
   crypt('trackalack', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Jules Ortega"}',
   now() - interval '67 days', now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities
  (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select
  u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.id in (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004'
)
on conflict do nothing;

-- ── seeding helper ──────────────────────────────────────────────────────────
-- `spec` packs a meal's items as  name|portion|kcal|source|ref  joined by ';'.
-- The meal's own total comes from the meal_items trigger, so it can never drift
-- from the lines beneath it.
create or replace function public.seed_meal(
  p_user  uuid,
  p_at    timestamptz,
  p_label text,
  p_spec  text
)
returns uuid
language plpgsql
as $fn$
declare
  entry_id uuid;
  part     text;
  bits     text[];
  idx      int := 0;
begin
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, source)
  values (p_user, 'calories', p_at, (p_at at time zone 'UTC')::date, 0, 'kcal', p_label, 'manual')
  returning id into entry_id;

  foreach part in array string_to_array(p_spec, ';')
  loop
    bits := string_to_array(trim(part), '|');
    insert into public.meal_items
      (entry_id, user_id, name, portion, kcal, match_source, match_ref, position)
    values
      (entry_id, p_user, bits[1], nullif(bits[2], ''), coalesce(bits[3]::numeric, 0),
       coalesce(nullif(bits[4], '')::public.food_source, 'manual'), nullif(bits[5], ''), idx);
    idx := idx + 1;
  end loop;

  return entry_id;
end;
$fn$;

-- ── the data ────────────────────────────────────────────────────────────────
do $$
declare
  me      uuid := 'a0000000-0000-4000-8000-000000000001';
  marcus  uuid := 'a0000000-0000-4000-8000-000000000002';
  priya   uuid := 'a0000000-0000-4000-8000-000000000003';
  jules   uuid := 'a0000000-0000-4000-8000-000000000004';
  today   date := (now() at time zone 'America/Los_Angeles')::date;
  -- How far the designed dates move: add it to any date written below.
  shift   int  := today - date '2026-09-07';

  overstory uuid;
  piranesi  uuid;
  novel        uuid;
  morning_page uuid;
  meal_id   uuid;
  conn      uuid;

  d          date;
  days_back  int;
  weight_val numeric;
  pages      int;
  page_at    int;
  menu_pick  int;
  meal_count int;
  i          int;

  -- Meals the history draws from: label, item name, portion, kcal, source, ref.
  breakfasts text[][] := array[
    array['Oats, banana, coffee',      'Rolled oats|80 g|304|usda|169705;Banana|1 medium|105|usda|173944;Black coffee|240 ml|11|usda|171890'],
    array['Eggs on toast',             'Scrambled eggs|2|182|usda|173424;Sourdough toast|2 slices|220|usda|172687'],
    array['Greek yogurt and granola',  'Greek yogurt, plain|170 g|100|usda|170903;Granola|45 g|200|off|3760020507350'],
    array['Oat latte and a pastry',    'Oat latte|350 ml|120|off|5060469850016;Almond croissant|1|330|off|3245390098979']
  ];
  lunches text[][] := array[
    array['Turkey sandwich, chips',    'Turkey sandwich|1|430|usda|174608;Kettle chips, sea salt|28 g|180|off|0084114'],
    array['Chicken burrito bowl',      'Chicken burrito bowl|1|640|usda|1104080'],
    array['Lentil soup and bread',     'Lentil soup|400 g|320|usda|174584;Rye bread|2 slices|180|usda|172686'],
    array['Grilled chicken salad',     'Grilled chicken salad|1|520|usda|171534;Iced tea, unsweetened|500 ml|2|off|0074780']
  ];
  dinners text[][] := array[
    array['Salmon, rice, greens',      'Baked salmon|140 g|280|usda|175168;Brown rice|180 g|216|usda|169704;Broccoli|120 g|41|usda|170379'],
    array['Two slices of pizza, salad','Pizza, cheese|2 slices|570|usda|170037;Side salad|1|310|usda|170401'],
    array['Pasta with tomato sauce',   'Spaghetti|180 g|280|usda|168927;Tomato sauce|150 g|110|off|8076809513692;Parmesan|20 g|84|usda|173417'],
    array['Stir fry and noodles',      'Chicken stir fry|350 g|480|usda|172851;Egg noodles|150 g|210|usda|168928']
  ];
  snacks text[][] := array[
    array['Yogurt, almonds',           'Greek yogurt, plain|170 g|280|manual|;Almonds|20 g|170|usda|170567'],
    array['Apple and peanut butter',   'Apple|1 medium|95|usda|171688;Peanut butter|32 g|188|usda|172470'],
    array['Post-run shake',            'Whey protein|30 g|120|off|5060360330273;Milk|250 ml|122|usda|171265;Banana|1 medium|68|usda|173944'],
    array['Oat latte',                 'Oat latte|350 ml|120|off|5060469850016']
  ];

begin
  update public.profiles set display_name = 'Nick Laffan', time_zone = 'America/Los_Angeles'
   where id = me;

  -- ── books ────────────────────────────────────────────────────────────────
  insert into public.books (user_id, title, author, total_pages, current_page, status, started_on, finished_on)
  values (me, 'Piranesi', 'Susanna Clarke', 272, 272, 'finished', (date '2026-08-01' + shift), (date '2026-08-22' + shift))
  returning id into piranesi;

  insert into public.books (user_id, title, author, total_pages, current_page, status, started_on)
  values (me, 'The Overstory', 'Richard Powers', 502, 0, 'reading', (date '2026-08-24' + shift))
  returning id into overstory;

  -- ── weight and calories, 13 weeks ────────────────────────────────────────
  d := today - 90;
  while d < today - 5 loop
    days_back := today - d;

    -- Down about 0.6 lb a week, with the wobble a real scale has. Roughly one
    -- day in nine goes unlogged.
    if (extract(doy from d)::int % 9) <> 3 then
      weight_val := round((182.4 + days_back * 0.085 + sin(days_back::numeric) * 0.35)::numeric, 1);
      insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, source)
      values (me, 'weight', d + time '06:40', d, weight_val, 'lb', weight_val::text, 'manual');
    end if;

    menu_pick := (extract(doy from d)::int % 4) + 1;
    meal_count := 3 + (extract(doy from d)::int % 2);

    perform public.seed_meal(me, d + time '07:10', breakfasts[menu_pick][1], breakfasts[menu_pick][2]);
    perform public.seed_meal(me, d + time '12:35', lunches[menu_pick][1], lunches[menu_pick][2]);
    perform public.seed_meal(me, d + time '19:20', dinners[menu_pick][1], dinners[menu_pick][2]);
    if meal_count = 4 then
      perform public.seed_meal(me, d + time '15:40', snacks[menu_pick][1], snacks[menu_pick][2]);
    end if;

    d := d + 1;
  end loop;

  -- ── reading: Piranesi, then The Overstory ────────────────────────────────
  page_at := 0;
  d := (date '2026-08-01' + shift);
  while d <= (date '2026-08-22' + shift) loop
    pages := case when (extract(doy from d)::int % 7) in (2, 5) then 0 else 10 + (extract(doy from d)::int % 19) end;
    if d = (date '2026-08-22' + shift) then
      pages := 272 - page_at;             -- finish the book on the last night
    else
      pages := least(pages, 272 - page_at); -- and never read past its last page
    end if;
    if pages > 0 then
      page_at := page_at + pages;
      insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload, source)
      values (me, 'reading', d + time '21:30', d, pages, 'pages', 'Piranesi',
              jsonb_build_object('book_id', piranesi, 'end_page', page_at), 'manual');
    end if;
    d := d + 1;
  end loop;

  -- The Overstory reaches p.190 by 2 September, so today's 24 pages land on 214.
  page_at := 0;
  for i in 0..9 loop
    d := (date '2026-08-24' + shift) + i;
    pages := (array[8, 12, 0, 24, 6, 0, 0, 9, 7, 6])[i + 1];
    if pages > 0 then
      page_at := page_at + pages;
      insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload, source)
      values (me, 'reading', d + time '21:15', d, pages, 'pages', 'The Overstory',
              jsonb_build_object('book_id', overstory, 'end_page', page_at), 'manual');
    end if;
  end loop;

  -- ── the last five days, exactly as the designs show them ─────────────────

  -- Thursday 3 September — 183.2 lb, 1,760 kcal, 30 pages
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label)
  values (me, 'weight', today - 4 + time '06:45', today - 4, 183.2, 'lb', '183.2');
  perform public.seed_meal(me, today - 4 + time '07:20', 'Eggs on toast',
    'Scrambled eggs|2|182|usda|173424;Sourdough toast|2 slices|220|usda|172687');
  perform public.seed_meal(me, today - 4 + time '12:40', 'Lentil soup and bread',
    'Lentil soup|400 g|320|usda|174584;Rye bread|2 slices|180|usda|172686');
  perform public.seed_meal(me, today - 4 + time '19:10', 'Pasta with tomato sauce',
    'Spaghetti|180 g|664|usda|168927;Tomato sauce|150 g|110|off|8076809513692;Parmesan|20 g|84|usda|173417');
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload)
  values (me, 'reading', today - 4 + time '21:40', today - 4, 30, 'pages', 'The Overstory',
          jsonb_build_object('book_id', overstory, 'end_page', 102));

  -- Friday 4 September — 183.0 lb, 2,120 kcal, 36 pages, reading streak milestone
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label)
  values (me, 'weight', today - 3 + time '06:35', today - 3, 183.0, 'lb', '183.0');
  perform public.seed_meal(me, today - 3 + time '07:05', 'Oats, banana, coffee',
    'Rolled oats|80 g|304|usda|169705;Banana|1 medium|105|usda|173944;Black coffee|240 ml|11|usda|171890');
  perform public.seed_meal(me, today - 3 + time '12:30', 'Chicken burrito bowl',
    'Chicken burrito bowl|1|640|usda|1104080');
  perform public.seed_meal(me, today - 3 + time '19:25', 'Salmon, rice, greens',
    'Baked salmon|140 g|529|usda|175168;Brown rice|180 g|490|usda|169704;Broccoli|120 g|41|usda|170379');
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload)
  values (me, 'reading', today - 3 + time '22:05', today - 3, 36, 'pages', 'The Overstory',
          jsonb_build_object('book_id', overstory, 'end_page', 138));

  -- Saturday 5 September — no weigh-in, 1,940 kcal over four meals, 12 pages
  perform public.seed_meal(me, today - 2 + time '08:30', 'Greek yogurt and granola',
    'Greek yogurt, plain|170 g|100|usda|170903;Granola|45 g|200|off|3760020507350');
  perform public.seed_meal(me, today - 2 + time '13:10', 'Grilled chicken salad',
    'Grilled chicken salad|1|520|usda|171534;Iced tea, unsweetened|500 ml|2|off|0074780');
  perform public.seed_meal(me, today - 2 + time '16:00', 'Post-run shake',
    'Whey protein|30 g|120|off|5060360330273;Milk|250 ml|122|usda|171265;Banana|1 medium|68|usda|173944');
  perform public.seed_meal(me, today - 2 + time '19:40', 'Stir fry and noodles',
    'Chicken stir fry|350 g|598|usda|172851;Egg noodles|150 g|210|usda|168928');
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload)
  values (me, 'reading', today - 2 + time '22:20', today - 2, 12, 'pages', 'The Overstory',
          jsonb_build_object('book_id', overstory, 'end_page', 150));

  -- Sunday 6 September — 182.6 lb, 2,410 kcal (over by 210), 40 pages
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label)
  values (me, 'weight', today - 1 + time '07:00', today - 1, 182.6, 'lb', '182.6');
  perform public.seed_meal(me, today - 1 + time '09:15', 'Oat latte and a pastry',
    'Oat latte|350 ml|120|off|5060469850016;Almond croissant|1|330|off|3245390098979');
  perform public.seed_meal(me, today - 1 + time '13:30', 'Turkey sandwich, chips',
    'Turkey sandwich|1|430|usda|174608;Kettle chips, sea salt|28 g|180|off|0084114');
  perform public.seed_meal(me, today - 1 + time '16:10', 'Apple and peanut butter',
    'Apple|1 medium|282|usda|171688;Peanut butter|32 g|188|usda|172470');
  perform public.seed_meal(me, today - 1 + time '19:40', 'Two slices of pizza, salad',
    'Pizza, cheese|2 slices|570|usda|170037;Side salad|1|310|usda|170401');
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload)
  values (me, 'reading', today - 1 + time '21:15', today - 1, 40, 'pages', 'The Overstory',
          jsonb_build_object('book_id', overstory, 'end_page', 190));

  -- Monday 7 September, today — 182.4 lb, 1,480 kcal over three meals, 24 pages
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label)
  values (me, 'weight', today + time '06:40', today, 182.4, 'lb', '182.4');
  perform public.seed_meal(me, today + time '07:10', 'Oats, banana, coffee',
    'Rolled oats|80 g|304|usda|169705;Banana|1 medium|105|usda|173944;Black coffee|240 ml|11|usda|171890');
  perform public.seed_meal(me, today + time '12:35', 'Turkey sandwich, chips',
    'Turkey sandwich|1|430|usda|174608;Kettle chips, sea salt|28 g|180|off|0084114');
  perform public.seed_meal(me, today + time '14:20', 'Yogurt, almonds',
    'Greek yogurt, plain|170 g|280|manual|;Almonds|20 g|170|usda|170567');
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, note, payload)
  values (me, 'reading', today + time '13:05', today, 24, 'pages', 'Read on the porch',
          'the chestnut section is the hinge of the whole book',
          jsonb_build_object('book_id', overstory, 'end_page', 214));

  -- ── writing projects ─────────────────────────────────────────────────────
  -- Writing stays switched off, so the dashboard still opens on the three
  -- modules the designs show. Turn it on in Settings → Modules and five weeks
  -- of sessions are already there: a novel counted in words, morning pages
  -- counted in minutes.
  insert into public.writing_projects (user_id, title, kind, measure, target, target_kind, status, started_on, position)
  values (me, 'The Lantern Room', 'Novel', 'words', 50000, 'total', 'active', (date '2026-08-03' + shift), 10)
  returning id into novel;

  insert into public.writing_projects (user_id, title, kind, measure, target, target_kind, status, started_on, position)
  values (me, 'Morning pages', 'Journal', 'min', 30, 'daily', 'active', (date '2026-07-20' + shift), 20)
  returning id into morning_page;

  insert into public.writing_projects (user_id, title, kind, measure, target, target_kind, status, started_on, finished_on)
  values (me, 'Conference talk', 'Talk', 'words', 3000, 'total', 'finished', (date '2026-06-15' + shift), (date '2026-07-02' + shift));

  for i in 0..34 loop
    d := today - 34 + i;

    -- The novel on most weekdays.
    if extract(isodow from d)::int <= 5 and (extract(doy from d)::int % 4) <> 2 then
      insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload)
      values (me, 'writing', d + time '09:05', d,
              340 + (extract(doy from d)::int * 37) % 520, 'words', 'The Lantern Room',
              jsonb_build_object('project_id', novel));
    end if;

    -- Morning pages most days, counted in time rather than words.
    if (extract(doy from d)::int % 5) <> 0 then
      insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload)
      values (me, 'writing', d + time '07:00', d,
              15 + (extract(doy from d)::int * 3) % 21, 'min', 'Morning pages',
              jsonb_build_object('project_id', morning_page));
    end if;
  end loop;

  -- Today, both measures on one day — 640 words on the novel, 25 minutes of pages.
  delete from public.entries where user_id = me and module_slug = 'writing' and local_date = today;
  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label, payload)
  values
    (me, 'writing', today + time '09:05', today, 640, 'words', 'The Lantern Room',
     jsonb_build_object('project_id', novel)),
    (me, 'writing', today + time '07:00', today, 25, 'min', 'Morning pages',
     jsonb_build_object('project_id', morning_page));

  -- ── saved meals ──────────────────────────────────────────────────────────
  insert into public.saved_meals (user_id, name, detail, kcal, items, uses) values
    (me, 'Usual breakfast', 'Oats 80 g · banana · black coffee', 420,
     '[{"name":"Rolled oats","portion":"80 g","kcal":304,"match_source":"usda","match_ref":"169705"},
       {"name":"Banana","portion":"1 medium","kcal":105,"match_source":"usda","match_ref":"173944"},
       {"name":"Black coffee","portion":"240 ml","kcal":11,"match_source":"usda","match_ref":"171890"}]'::jsonb, 34),
    (me, 'Post-run shake', 'Whey 30 g · milk 250 ml · banana', 310,
     '[{"name":"Whey protein","portion":"30 g","kcal":120,"match_source":"off","match_ref":"5060360330273"},
       {"name":"Milk","portion":"250 ml","kcal":122,"match_source":"usda","match_ref":"171265"},
       {"name":"Banana","portion":"1 medium","kcal":68,"match_source":"usda","match_ref":"173944"}]'::jsonb, 12),
    (me, 'Oat latte', 'Oat milk 200 ml · double shot', 120,
     '[{"name":"Oat latte","portion":"350 ml","kcal":120,"match_source":"off","match_ref":"5060469850016"}]'::jsonb, 21);

  -- ── goals and milestones ─────────────────────────────────────────────────
  insert into public.goals (user_id, module_slug, kind, title, series, target, comparator, cadence, due_on, achieved_at)
  values
    (me, 'calories', 'goal',      'Under 2,200 kcal daily',      'calories.daily', 2200, '<=', 'daily',  null, null),
    (me, 'calories', 'goal',      'Log every meal',              'calories.meals', null, null, 'daily',  null, null),
    (me, 'weight',   'goal',      'Log daily',                   'weight.daily',   null, null, 'daily',  null, null),
    (me, 'weight',   'goal',      'Weight check-in',             'weight.daily',   null, null, 'weekly', (date '2026-09-14' + shift), null),
    (me, 'reading',  'goal',      '30 pages daily',              'reading.pages',    30, '>=', 'daily',  null, null),
    (me, 'weight',   'milestone', '180.0 lb',                    'weight.daily',    180, '<=', 'once',   (date '2026-09-24' + shift), null),
    (me, 'calories', 'milestone', '30-day mean under 1,900',     'calories.daily', 1900, '<=', 'once',   (date '2026-10-07' + shift), null),
    (me, 'reading',  'milestone', 'Finish The Overstory',        'reading.pages',   502, '>=', 'once',   (date '2026-09-30' + shift), null),
    (me, 'reading',  'milestone', '5-day reading streak',        'reading.pages',     5, '>=', 'once',   (date '2026-09-04' + shift),
     (date '2026-09-04' + shift) + time '22:05'),
    (me, 'writing',  'goal',      '750 words daily',             'writing.words',   750, '>=', 'daily',  null, null),
    (me, 'writing',  'goal',      '30 minutes of pages',         'writing.minutes',  30, '>=', 'daily',  null, null);

  -- ── connections ──────────────────────────────────────────────────────────
  -- Marcus: he shares Reading, you share Weight and Reading.
  insert into public.connections (requester_id, addressee_id, status, responded_at)
  values (me, marcus, 'active', now() - interval '20 days')
  returning id into conn;
  insert into public.connection_shares (connection_id, owner_id, module_slug) values
    (conn, me, 'weight'), (conn, me, 'reading'), (conn, marcus, 'reading');

  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label)
  select marcus, 'reading', (today - g) + time '22:00', today - g,
         (array[18, 25, 0, 32, 21])[g + 1], 'pages', 'Sea of Tranquility'
    from generate_series(0, 4) g
   where (array[18, 25, 0, 32, 21])[g + 1] > 0;

  -- Priya: she shares Calories and Weight, you share Calories.
  insert into public.connections (requester_id, addressee_id, status, responded_at)
  values (priya, me, 'active', now() - interval '11 days')
  returning id into conn;
  insert into public.connection_shares (connection_id, owner_id, module_slug) values
    (conn, me, 'calories'), (conn, priya, 'calories'), (conn, priya, 'weight');

  insert into public.entries (user_id, module_slug, occurred_at, local_date, value, unit, label)
  select priya, 'weight', (today - g) + time '07:15', today - g,
         round((141.2 + g * 0.1)::numeric, 1), 'lb', 'weigh-in'
    from generate_series(0, 4) g;

  -- Jules: request sent, still waiting.
  insert into public.connections (requester_id, addressee_id, status)
  values (me, jules, 'pending');

  -- Priya also keeps Running on, which is why her dashboard differs from yours.
  update public.user_modules set active = true where user_id = priya and module_slug = 'running';
end
$$;

drop function public.seed_meal(uuid, timestamptz, text, text);
