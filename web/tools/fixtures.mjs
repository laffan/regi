// Fixture data shaped exactly like the API responses, for the offline preview.
// Mirrors app/supabase/seed.sql so the screens show the numbers the designs do.

// Anchored to the machine's today, so the preview always has a full current
// day; the designed numbers land on the last five days whatever the date is.
export const TODAY = new Date().toISOString().slice(0, 10);

const iso = (date, time) => `${date}T${time}:00.000Z`;

const daysAgo = (n) => {
  const d = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const yesterday = daysAgo(1);

export const profile = {
  id: 'a0000000-0000-4000-8000-000000000001',
  email: 'you@trackalack.test',
  display_name: 'Nick Laffan',
  time_zone: 'America/Los_Angeles',
  weight_unit: 'lb',
  distance_unit: 'mi',
  accent_color: '#6495ED',
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
    subscribes: ['weight.daily'], log_label: 'Log food', sort_order: 20,
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
    primary_series: 'writing.words',
    publishes: ['writing.words', 'writing.minutes', 'writing.projects'], subscribes: [],
    log_label: 'Log session', sort_order: 50,
    measure_setting: 'measure',
    series_by_unit: { words: 'writing.words', min: 'writing.minutes' },
  },
  {
    slug: 'sleep', name: 'Sleep', icon: 'bell', unit: 'h', value_kind: 'sum',
    primary_series: 'sleep.hours', publishes: ['sleep.hours'], subscribes: [],
    log_label: 'Log sleep', sort_order: 60,
  },
  // An activity tracker the account made: one yes/no a day.
  {
    slug: 'act-water', name: 'Two litres of water', icon: 'glass-water', unit: 'done', value_kind: 'last',
    primary_series: 'activity.act-water', publishes: ['activity.act-water'], subscribes: [],
    log_label: 'I did!', sort_order: 100, owner_id: 'a0000000-0000-4000-8000-000000000001', kind: 'activity',
    icon_nodes: [
      ['path', { d: 'M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z' }],
      ['path', { d: 'M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0' }],
    ],
  },
];

export function userModules(activeSlugs) {
  return modules.map((m) => ({
    user_id: profile.id,
    module_slug: m.slug,
    active: activeSlugs.includes(m.slug),
    position: m.sort_order,
    settings:
      m.slug === 'calories'
        ? { source_order: ['usda', 'off', 'openai'], daily_target: 2200 }
        : m.slug === 'writing'
          ? { measure: 'words' }
          : {},
  }));
}

// 90 days of history, ending on the values the designs show.
export function dailyTotals() {
  const rows = [];
  const end = new Date(`${TODAY}T00:00:00Z`);

  // Keyed by how many days back, so they always sit on the newest five days.
  const exact = [
    { weight: 182.4, calories: 1480, reading: 24, running: 5.1, writing: 640, minutes: 25, meals: 3 },
    { weight: 182.6, calories: 2410, reading: 40, writing: 820, meals: 4 },
    { calories: 1940, reading: 12, running: 3.2, minutes: 30, meals: 4 },
    { weight: 183.0, calories: 2120, reading: 36, writing: 910, meals: 3 },
    { weight: 183.2, calories: 1760, reading: 30, running: 4.4, minutes: 18, meals: 3 },
  ];

  for (let back = 0; back < 90; back++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - back);
    const date = d.toISOString().slice(0, 10);
    const fixed = exact[back];

    const weight = fixed?.weight ?? (back % 9 === 3 ? null : Math.round((182.4 + back * 0.085 + Math.sin(back) * 0.35) * 10) / 10);
    const minutes = fixed?.minutes ?? (back % 5 === 0 ? 0 : 15 + ((back * 3) % 21));
    const calories = fixed?.calories ?? Math.round(1700 + Math.sin(back * 1.7) * 380 + (back % 5) * 40);
    const reading = fixed?.reading ?? (back % 7 === 2 ? 0 : 10 + ((back * 7) % 26));
    const running = fixed?.running ?? (back % 3 === 0 ? Math.round((3 + (back % 4)) * 10) / 10 : 0);
    const writing = fixed?.writing ?? (back % 4 === 1 ? 0 : 400 + ((back * 53) % 500));

    const row = (module_slug, value, unit, entry_count, at, measures) => ({
      user_id: profile.id, local_date: date, module_slug, value, unit, entry_count,
      last_at: iso(date, at), measures,
    });

    if (weight !== null) rows.push(row('weight', weight, 'lb', 1, '06:40', { lb: weight }));
    rows.push(row('calories', calories, 'kcal', fixed?.meals ?? 3, '19:20', { kcal: calories }));
    if (reading) rows.push(row('reading', reading, 'pages', 1, '21:15', { pages: reading }));
    if (running) rows.push(row('running', running, 'mi', 1, '17:30', { mi: running }));

    // Writing records words and minutes side by side; the day's headline is
    // whichever unit the measure setting picks, and both stay in `measures`.
    // The water tracker: done most days.
    if (back % 4 !== 2 && back !== 0) rows.push(row('act-water', 1, 'done', 1, '20:00', { done: 1 }));

    if (writing || minutes) {
      const measures = {};
      if (writing) measures.words = writing;
      if (minutes) measures.min = minutes;
      rows.push(
        row('writing', writing || null, 'words', (writing ? 1 : 0) + (minutes ? 1 : 0), '09:00', measures),
      );
    }
  }

  return rows;
}

export const entries = [
  {
    id: 'e1', user_id: profile.id, module_slug: 'calories', occurred_at: iso(TODAY, '14:20'),
    local_date: TODAY, value: 396, unit: 'kcal', label: 'Yogurt, almonds', note: null, payload: {}, source: 'manual',
    items: [
      { id: 'i1', name: 'Greek yogurt, plain', portion: '170 g', kcal: 280, match_source: 'openai', match_ref: 'gpt-5.6-sol', matched_name: 'Greek yogurt, whole milk, plain', basis: 'OpenAI estimate for 170 g', protein_g: 15.3, carbs_g: 6.6, fat_g: 8.5, fiber_g: 0 },
      { id: 'i2', name: 'Almonds', portion: '20 g', kcal: 116, match_source: 'usda', match_ref: '170567', matched_name: 'Nuts, almonds', basis: '20 g × 579 kcal/100 g', protein_g: 4.2, carbs_g: 4.3, fat_g: 10, fiber_g: 2.5 },
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
      { id: 'i3', name: 'Turkey sandwich', portion: '1', kcal: 430, match_source: 'usda', match_ref: '174608', matched_name: 'Sandwich, turkey', basis: '1 × 430 kcal per serving', protein_g: 24, carbs_g: 44, fat_g: 16, fiber_g: 3 },
      { id: 'i4', name: 'Kettle chips, sea salt', portion: '28 g', kcal: 180, match_source: 'off', match_ref: '0084114', matched_name: 'Sea salt kettle chips', basis: '28 g × 643 kcal/100 g', protein_g: 2, carbs_g: 16, fat_g: 11, fiber_g: 1 },
    ],
  },
  {
    id: 'e4', user_id: profile.id, module_slug: 'calories', occurred_at: iso(TODAY, '07:10'),
    local_date: TODAY, value: 411, unit: 'kcal', label: 'Oats, banana, coffee', note: null, payload: {}, source: 'manual',
    items: [
      { id: 'i5', name: 'Rolled oats', portion: '80 g', kcal: 304, match_source: 'usda', match_ref: '169705', matched_name: 'Oats', basis: '80 g × 379 kcal/100 g', protein_g: 10.5, carbs_g: 54, fat_g: 5.2, fiber_g: 8 },
      { id: 'i6', name: 'Banana', portion: '1 medium', kcal: 105, match_source: 'usda', match_ref: '173944', matched_name: 'Bananas, raw', basis: '1 × 105 kcal per serving (118 g)', protein_g: 1.3, carbs_g: 27, fat_g: 0.4, fiber_g: 3.1 },
      { id: 'i7', name: 'Black coffee', portion: '240 ml', kcal: 2, match_source: 'manual', match_ref: null, matched_name: null, basis: 'stated in the log', protein_g: 0.3, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    ],
  },
  {
    id: 'e8', user_id: profile.id, module_slug: 'writing', occurred_at: iso(TODAY, '09:05'),
    local_date: TODAY, value: 640, unit: 'words', label: 'The Lantern Room', note: null,
    payload: { project_id: 'wp1' }, source: 'manual', items: [],
  },
  {
    id: 'e9', user_id: profile.id, module_slug: 'writing', occurred_at: iso(TODAY, '07:00'),
    local_date: TODAY, value: 25, unit: 'min', label: 'Morning pages', note: null,
    payload: { project_id: 'wp2' }, source: 'manual', items: [],
  },
  {
    id: 'e5', user_id: profile.id, module_slug: 'weight', occurred_at: iso(TODAY, '06:40'),
    local_date: TODAY, value: 182.4, unit: 'lb', label: '182.4', note: null, payload: {}, source: 'manual', items: [],
  },
  {
    id: 'e6', user_id: profile.id, module_slug: 'reading', occurred_at: iso(yesterday, '21:15'),
    local_date: yesterday, value: 40, unit: 'pages', label: '40 pages before bed', note: null,
    payload: { book_id: 'b1', end_page: 190 }, source: 'manual', items: [],
  },
  {
    id: 'e7', user_id: profile.id, module_slug: 'calories', occurred_at: iso(yesterday, '19:40'),
    local_date: yesterday, value: 880, unit: 'kcal', label: 'Two slices of pizza, salad', note: null,
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
  { id: 'g3', module_slug: 'weight', kind: 'goal', title: 'Weight check-in', series: 'weight.daily', target: null, comparator: null, cadence: 'weekly', due_on: daysAgo(-7), achieved_at: null, active: true },
  { id: 'g4', module_slug: 'weight', kind: 'milestone', title: '180.0 lb', series: 'weight.daily', target: 180, comparator: '<=', cadence: 'once', due_on: daysAgo(-17), achieved_at: null, active: true },
  { id: 'g5', module_slug: 'reading', kind: 'milestone', title: 'Finish The Overstory', series: 'reading.pages', target: 502, comparator: '>=', cadence: 'once', due_on: daysAgo(-23), achieved_at: null, active: true },
  { id: 'g6', module_slug: 'calories', kind: 'milestone', title: '30-day mean under 1,900', series: 'calories.daily', target: 1900, comparator: '<=', cadence: 'once', due_on: daysAgo(-30), achieved_at: null, active: true },
  { id: 'g7', module_slug: 'running', kind: 'goal', title: '20 mi weekly', series: 'running.miles', target: 20, comparator: '>=', cadence: 'weekly', due_on: null, achieved_at: null, active: true },
  { id: 'g8', module_slug: 'writing', kind: 'goal', title: '750 words daily', series: 'writing.words', target: 750, comparator: '>=', cadence: 'daily', due_on: null, achieved_at: null, active: true },
  { id: 'g9', module_slug: 'writing', kind: 'goal', title: '30 minutes of pages', series: 'writing.minutes', target: 30, comparator: '>=', cadence: 'daily', due_on: null, achieved_at: null, active: true },
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
        { name: 'Grilled chicken salad', portion: null, kcal: 520, match_source: 'usda', match_ref: '171534', matched_name: 'Salad, grilled chicken', basis: 'no weight given — assumed 100 g at 520 kcal/100 g', protein_g: 38, carbs_g: 12, fat_g: 34, fiber_g: 4 },
        { name: 'Iced tea, unsweetened', portion: null, kcal: 2, match_source: 'off', match_ref: '0074780', matched_name: 'Unsweetened iced tea', basis: '1 × 2 kcal per serving (500 ml)', protein_g: 0, carbs_g: 0.5, fat_g: 0, fiber_g: 0 },
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
    i_share: ['reading', 'weight'], they_share: ['reading'],
    i_share_detail: { weight: 'presence', reading: 'full' }, they_share_detail: { reading: 'full' }, i_mute: [],
  },
  {
    id: 'c2', status: 'active', created_at: '2026-08-27', requester_id: 'a3',
    addressee_id: profile.id, other_id: 'a3', i_requested: false,
    i_share: ['calories'], they_share: ['calories', 'weight'],
    i_share_detail: { calories: 'full' }, they_share_detail: { calories: 'presence', weight: 'full' }, i_mute: ['weight'],
  },
  {
    id: 'c3', status: 'pending', created_at: '2026-09-02', requester_id: profile.id,
    addressee_id: 'a4', other_id: 'a4', i_requested: true, i_share: [], they_share: [],
    i_share_detail: {}, they_share_detail: {}, i_mute: [],
  },
];

export const people = [
  { id: 'a2', email: 'marcus@example.com', display_name: 'Marcus Reid' },
  { id: 'a3', email: 'priya@example.com', display_name: 'Priya Raman' },
  { id: 'a4', email: 'jules@example.com', display_name: 'Jules Ortega' },
];

export const writingProjects = [
  {
    id: 'wp1', title: 'The Lantern Room', kind: 'Novel', measure: 'words',
    target: 50000, target_kind: 'total', status: 'active',
    started_on: '2026-08-03', finished_on: null, position: 10,
  },
  {
    id: 'wp2', title: 'Morning pages', kind: 'Journal', measure: 'min',
    target: 30, target_kind: 'daily', status: 'active',
    started_on: '2026-07-20', finished_on: null, position: 20,
  },
  {
    id: 'wp3', title: 'Conference talk', kind: 'Talk', measure: 'words',
    target: 3000, target_kind: 'total', status: 'finished',
    started_on: '2026-06-15', finished_on: '2026-07-02', position: 30,
  },
];

export const writingProjectTotals = [
  { project_id: 'wp1', words: 11140, minutes: 0, sessions: 19, last_on: TODAY, first_on: '2026-08-03' },
  { project_id: 'wp2', words: 0, minutes: 697, sessions: 29, last_on: TODAY, first_on: '2026-07-20' },
  { project_id: 'wp3', words: 3120, minutes: 0, sessions: 11, last_on: '2026-07-02', first_on: '2026-06-15' },
];

// What connections share back: Marcus's reading in full, Priya's calories as
// presence only (no number), her weight hidden by the viewer.
export function sharedTotals() {
  const rows = [];
  for (let back = 0; back < 30; back++) {
    const date = daysAgo(back);
    if (back % 3 !== 1) {
      rows.push({ owner_id: 'a2', local_date: date, module_slug: 'reading', detail: 'full', entry_count: 1, value: 15 + ((back * 7) % 30), unit: 'pages', measures: null });
    }
    if (back % 5 !== 3) {
      rows.push({ owner_id: 'a3', local_date: date, module_slug: 'calories', detail: 'presence', entry_count: 3, value: null, unit: null, measures: null });
    }
  }
  return rows;
}

export const dayClosures = [{ module_slug: 'calories', local_date: yesterday, closed_at: iso(yesterday, '20:30') }];

// The schema the fixtures stand for; matches web/src/lib/schema.ts.
export const SCHEMA_VERSION = '20261103000100';
