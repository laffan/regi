// Fixture data shaped exactly like the API responses, for the offline preview.
// Mirrors app/supabase/seed.sql so the screens show the numbers the designs do.

export const TODAY = '2026-09-07';

const iso = (date, time) => `${date}T${time}:00.000Z`;

export const profile = {
  id: 'a0000000-0000-4000-8000-000000000001',
  email: 'you@trackalack.test',
  display_name: 'Nick Laffan',
  time_zone: 'America/Los_Angeles',
  weight_unit: 'lb',
  distance_unit: 'mi',
};

export const modules = [
  {
    slug: 'weight', name: 'Weight', icon: 'scale', unit: 'lb', value_kind: 'last',
    primary_series: 'weight.daily', publishes: ['weight.daily'], subscribes: [],
    log_label: 'Log weight', sort_order: 10,
  },
  {
    slug: 'calories', name: 'Calories', icon: 'utensils', unit: 'kcal', value_kind: 'sum',
    primary_series: 'calories.daily', publishes: ['calories.daily', 'calories.meals'],
    subscribes: ['weight.daily'], log_label: 'Log meal', sort_order: 20,
  },
  {
    slug: 'reading', name: 'Reading', icon: 'book-open', unit: 'pages', value_kind: 'sum',
    primary_series: 'reading.pages', publishes: ['reading.pages', 'reading.books'], subscribes: [],
    log_label: 'Log pages', sort_order: 30,
  },
  {
    slug: 'running', name: 'Running', icon: 'footprints', unit: 'mi', value_kind: 'sum',
    primary_series: 'running.miles', publishes: ['running.miles', 'running.pace'], subscribes: [],
    log_label: 'Log run', sort_order: 40,
  },
  {
    slug: 'writing', name: 'Writing', icon: 'pencil', unit: 'words', value_kind: 'sum',
    primary_series: 'writing.words', publishes: ['writing.words'], subscribes: [],
    log_label: 'Log session', sort_order: 50,
  },
  {
    slug: 'sleep', name: 'Sleep', icon: 'bell', unit: 'h', value_kind: 'sum',
    primary_series: 'sleep.hours', publishes: ['sleep.hours'], subscribes: [],
    log_label: 'Log sleep', sort_order: 60,
  },
];

export function userModules(activeSlugs) {
  return modules.map((m) => ({
    user_id: profile.id,
    module_slug: m.slug,
    active: activeSlugs.includes(m.slug),
    position: m.sort_order,
    settings: m.slug === 'calories' ? { source_order: ['usda', 'off'], daily_target: 2200 } : {},
  }));
}

// 90 days of history, ending on the values the designs show.
export function dailyTotals() {
  const rows = [];
  const end = new Date(`${TODAY}T00:00:00Z`);

  const exact = {
    '2026-09-07': { weight: 182.4, calories: 1480, reading: 24, running: 5.1, writing: 640, meals: 3 },
    '2026-09-06': { weight: 182.6, calories: 2410, reading: 40, writing: 820, meals: 4 },
    '2026-09-05': { calories: 1940, reading: 12, running: 3.2, meals: 4 },
    '2026-09-04': { weight: 183.0, calories: 2120, reading: 36, writing: 910, meals: 3 },
    '2026-09-03': { weight: 183.2, calories: 1760, reading: 30, running: 4.4, meals: 3 },
  };

  for (let back = 0; back < 90; back++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - back);
    const date = d.toISOString().slice(0, 10);
    const fixed = exact[date];

    const weight = fixed?.weight ?? (back % 9 === 3 ? null : Math.round((182.4 + back * 0.085 + Math.sin(back) * 0.35) * 10) / 10);
    const calories = fixed?.calories ?? Math.round(1700 + Math.sin(back * 1.7) * 380 + (back % 5) * 40);
    const reading = fixed?.reading ?? (back % 7 === 2 ? 0 : 10 + ((back * 7) % 26));
    const running = fixed?.running ?? (back % 3 === 0 ? Math.round((3 + (back % 4)) * 10) / 10 : 0);
    const writing = fixed?.writing ?? (back % 4 === 1 ? 0 : 400 + ((back * 53) % 500));

    if (weight !== null) rows.push({ user_id: profile.id, local_date: date, module_slug: 'weight', value: weight, unit: 'lb', entry_count: 1, last_at: iso(date, '06:40') });
    rows.push({ user_id: profile.id, local_date: date, module_slug: 'calories', value: calories, unit: 'kcal', entry_count: fixed?.meals ?? 3, last_at: iso(date, '19:20') });
    if (reading) rows.push({ user_id: profile.id, local_date: date, module_slug: 'reading', value: reading, unit: 'pages', entry_count: 1, last_at: iso(date, '21:15') });
    if (running) rows.push({ user_id: profile.id, local_date: date, module_slug: 'running', value: running, unit: 'mi', entry_count: 1, last_at: iso(date, '17:30') });
    if (writing) rows.push({ user_id: profile.id, local_date: date, module_slug: 'writing', value: writing, unit: 'words', entry_count: 1, last_at: iso(date, '09:00') });
  }

  return rows;
}

export const entries = [
  {
    id: 'e1', user_id: profile.id, module_slug: 'calories', occurred_at: iso(TODAY, '14:20'),
    local_date: TODAY, value: 450, unit: 'kcal', label: 'Yogurt, almonds', note: null, payload: {}, source: 'manual',
    items: [
      { id: 'i1', name: 'Greek yogurt, plain', portion: '170 g', kcal: 280, match_source: 'manual', match_ref: null },
      { id: 'i2', name: 'Almonds', portion: '20 g', kcal: 170, match_source: 'usda', match_ref: '170567' },
    ],
  },
  {
    id: 'e2', user_id: profile.id, module_slug: 'reading', occurred_at: iso(TODAY, '13:05'),
    local_date: TODAY, value: 24, unit: 'pages', label: 'Read on the porch',
    note: 'the chestnut section is the hinge of the whole book',
    payload: { book_id: 'b1', end_page: 214 }, source: 'manual', items: [],
  },
  {
    id: 'e3', user_id: profile.id, module_slug: 'calories', occurred_at: iso(TODAY, '12:35'),
    local_date: TODAY, value: 610, unit: 'kcal', label: 'Turkey sandwich, chips', note: null, payload: {}, source: 'manual',
    items: [
      { id: 'i3', name: 'Turkey sandwich', portion: '1', kcal: 430, match_source: 'usda', match_ref: '174608' },
      { id: 'i4', name: 'Kettle chips, sea salt', portion: '28 g', kcal: 180, match_source: 'off', match_ref: '0084114' },
    ],
  },
  {
    id: 'e4', user_id: profile.id, module_slug: 'calories', occurred_at: iso(TODAY, '07:10'),
    local_date: TODAY, value: 420, unit: 'kcal', label: 'Oats, banana, coffee', note: null, payload: {}, source: 'manual',
    items: [
      { id: 'i5', name: 'Rolled oats', portion: '80 g', kcal: 304, match_source: 'usda', match_ref: '169705' },
      { id: 'i6', name: 'Banana', portion: '1 medium', kcal: 105, match_source: 'usda', match_ref: '173944' },
      { id: 'i7', name: 'Black coffee', portion: '240 ml', kcal: 11, match_source: 'usda', match_ref: '171890' },
    ],
  },
  {
    id: 'e5', user_id: profile.id, module_slug: 'weight', occurred_at: iso(TODAY, '06:40'),
    local_date: TODAY, value: 182.4, unit: 'lb', label: '182.4', note: null, payload: {}, source: 'manual', items: [],
  },
  {
    id: 'e6', user_id: profile.id, module_slug: 'reading', occurred_at: iso('2026-09-06', '21:15'),
    local_date: '2026-09-06', value: 40, unit: 'pages', label: '40 pages before bed', note: null,
    payload: { book_id: 'b1', end_page: 190 }, source: 'manual', items: [],
  },
  {
    id: 'e7', user_id: profile.id, module_slug: 'calories', occurred_at: iso('2026-09-06', '19:40'),
    local_date: '2026-09-06', value: 880, unit: 'kcal', label: 'Two slices of pizza, salad', note: null,
    payload: {}, source: 'manual', items: [],
  },
];

export const books = [
  {
    id: 'b1', title: 'The Overstory', author: 'Richard Powers', cover_url: null,
    total_pages: 502, current_page: 214, status: 'reading', started_on: '2026-08-24', finished_on: null,
  },
  {
    id: 'b2', title: 'Piranesi', author: 'Susanna Clarke', cover_url: null,
    total_pages: 272, current_page: 272, status: 'finished', started_on: '2026-08-01', finished_on: '2026-08-22',
  },
];

export const savedMeals = [
  { id: 's1', name: 'Usual breakfast', detail: 'Oats 80 g · banana · black coffee', kcal: 420, items: [], uses: 34 },
  { id: 's2', name: 'Post-run shake', detail: 'Whey 30 g · milk 250 ml · banana', kcal: 310, items: [], uses: 12 },
  { id: 's3', name: 'Oat latte', detail: 'Oat milk 200 ml · double shot', kcal: 120, items: [], uses: 21 },
];

export const goals = [
  { id: 'g1', module_slug: 'calories', kind: 'goal', title: 'Under 2,200', series: 'calories.daily', target: 2200, comparator: '<=', cadence: 'daily', due_on: null, achieved_at: null, active: true },
  { id: 'g2', module_slug: 'reading', kind: 'goal', title: '30 pages daily', series: 'reading.pages', target: 30, comparator: '>=', cadence: 'daily', due_on: null, achieved_at: null, active: true },
  { id: 'g3', module_slug: 'weight', kind: 'goal', title: 'Weight check-in', series: 'weight.daily', target: null, comparator: null, cadence: 'weekly', due_on: '2026-09-14', achieved_at: null, active: true },
  { id: 'g4', module_slug: 'weight', kind: 'milestone', title: '180.0 lb', series: 'weight.daily', target: 180, comparator: '<=', cadence: 'once', due_on: '2026-09-24', achieved_at: null, active: true },
  { id: 'g5', module_slug: 'reading', kind: 'milestone', title: 'Finish The Overstory', series: 'reading.pages', target: 502, comparator: '>=', cadence: 'once', due_on: '2026-09-30', achieved_at: null, active: true },
  { id: 'g6', module_slug: 'calories', kind: 'milestone', title: '30-day mean under 1,900', series: 'calories.daily', target: 1900, comparator: '<=', cadence: 'once', due_on: '2026-10-07', achieved_at: null, active: true },
  { id: 'g7', module_slug: 'running', kind: 'goal', title: '20 mi weekly', series: 'running.miles', target: 20, comparator: '>=', cadence: 'weekly', due_on: null, achieved_at: null, active: true },
  { id: 'g8', module_slug: 'writing', kind: 'goal', title: '750 words daily', series: 'writing.words', target: 750, comparator: '>=', cadence: 'daily', due_on: null, achieved_at: null, active: true },
];

export const draft = {
  id: 'd1', raw_text: 'grilled chicken salad and an iced tea, read 18 pages',
  status: 'pending', parser: 'openai', parse_error: null, created_at: iso(TODAY, '18:45'),
};

export const draftRows = [
  {
    id: 'dr1', draft_id: 'd1', module_slug: 'calories', label: 'Grilled chicken salad, iced tea',
    value: 522, unit: 'kcal', occurred_at: iso(TODAY, '18:45'),
    payload: {
      items: [
        { name: 'Grilled chicken salad', portion: null, kcal: 520, match_source: 'usda', match_ref: '171534' },
        { name: 'Iced tea, unsweetened', portion: null, kcal: 2, match_source: 'off', match_ref: '0074780' },
      ],
    },
    match_note: 'USDA · 2 matches', position: 0,
  },
  {
    id: 'dr2', draft_id: 'd1', module_slug: 'reading', label: 'The Overstory', value: 18, unit: 'pages',
    occurred_at: iso(TODAY, '21:30'), payload: { book_id: 'b1', end_page: 232 },
    match_note: 'current book assumed', position: 1,
  },
];

export const connections = [
  {
    id: 'c1', status: 'active', created_at: '2026-08-18', requester_id: profile.id,
    addressee_id: 'a2', other_id: 'a2', i_requested: true,
    i_share: ['weight', 'reading'], they_share: ['reading'],
  },
  {
    id: 'c2', status: 'active', created_at: '2026-08-27', requester_id: 'a3',
    addressee_id: profile.id, other_id: 'a3', i_requested: false,
    i_share: ['calories'], they_share: ['calories', 'weight'],
  },
  {
    id: 'c3', status: 'pending', created_at: '2026-09-02', requester_id: profile.id,
    addressee_id: 'a4', other_id: 'a4', i_requested: true, i_share: [], they_share: [],
  },
];

export const people = [
  { id: 'a2', email: 'marcus@example.com', display_name: 'Marcus Reid' },
  { id: 'a3', email: 'priya@example.com', display_name: 'Priya Raman' },
  { id: 'a4', email: 'jules@example.com', display_name: 'Jules Ortega' },
];
