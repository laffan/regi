/** The modules that ship with the app. */
export type BuiltinSlug = 'weight' | 'calories' | 'reading' | 'running' | 'writing' | 'sleep';
/** Any module: a built-in, or an activity tracker a person made ("act-…"). */
export type ModuleSlug = BuiltinSlug | (string & {});
export type FoodSource = 'usda' | 'off' | 'openai' | 'manual' | 'saved';
/** The sources a food can be priced against, in the user's order. */
export type LookupSource = 'usda' | 'off' | 'openai';

/** An SVG element on the 24×24 icon grid: [tag, attributes]. */
export type IconNode = [string, Record<string, string | number>][];
export type EntrySource = 'manual' | 'log' | 'saved_meal' | 'import';

export interface ModuleRow {
  slug: ModuleSlug;
  name: string;
  icon: string;
  unit: string | null;
  value_kind: 'last' | 'sum';
  primary_series: string;
  publishes: string[];
  subscribes: string[];
  log_label: string;
  sort_order: number;
  /** Settings key naming the unit that leads, for modules recording more than one. */
  measure_setting: string | null;
  /** Unit → series name, for modules publishing one series per unit. */
  series_by_unit: Record<string, string> | null;
  /** Null for built-ins; the person who made an activity tracker. */
  owner_id?: string | null;
  kind?: 'builtin' | 'activity';
  /** Activity trackers: the icon's geometry, drawn without the icon library. */
  icon_nodes?: IconNode | null;
}

export interface UserModule {
  user_id: string;
  module_slug: ModuleSlug;
  active: boolean;
  position: number;
  settings: {
    source_order?: LookupSource[];
    daily_target?: number;
    /** Writing: which unit leads on the calendar. */
    measure?: WritingMeasure;
    [key: string]: unknown;
  };
}

export interface Macros {
  protein_g: number | null;
  /** Total carbohydrate, fibre included, as labels and USDA report it. */
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
}

export interface MealItem extends Partial<Macros> {
  id?: string;
  name: string;
  portion: string | null;
  kcal: number | null;
  match_source: FoodSource;
  /** USDA fdcId, Open Food Facts barcode, or the OpenAI model that estimated it. */
  match_ref: string | null;
  /** What the item was priced against, e.g. "Yogurt, Greek, plain, nonfat". */
  matched_name?: string | null;
  /** How kcal was reached, e.g. "80 g × 380 kcal/100 g". Null when set by hand. */
  basis?: string | null;
}

export interface Entry {
  id: string;
  user_id: string;
  module_slug: ModuleSlug;
  occurred_at: string;
  local_date: string;
  value: number | null;
  unit: string | null;
  label: string | null;
  note: string | null;
  payload: {
    book_id?: string;
    end_page?: number;
    duration_s?: number;
    [key: string]: unknown;
  };
  source: EntrySource;
  items?: MealItem[];
}

export interface DailyTotal {
  user_id: string;
  local_date: string;
  module_slug: ModuleSlug;
  /** The headline unit's number; null when the day only holds another unit. */
  value: number | null;
  unit: string | null;
  entry_count: number;
  last_at: string;
  /** Every unit recorded that day, e.g. { words: 640, min: 25 }. */
  measures: Record<string, number> | null;
}

export type WritingMeasure = 'words' | 'min';

export interface WritingProject {
  id: string;
  title: string;
  kind: string | null;
  measure: WritingMeasure;
  target: number | null;
  target_kind: 'total' | 'daily';
  status: 'active' | 'finished' | 'shelved';
  started_on: string | null;
  finished_on: string | null;
  position: number;
}

export interface WritingProjectTotals {
  project_id: string;
  words: number;
  minutes: number;
  sessions: number;
  last_on: string | null;
  first_on: string | null;
}

/** A project with its derived totals folded in. */
export interface ProjectWithTotals extends WritingProject {
  words: number;
  minutes: number;
  sessions: number;
  last_on: string | null;
}

export interface Book {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  total_pages: number | null;
  current_page: number;
  status: 'reading' | 'finished' | 'shelved';
  started_on: string | null;
  finished_on: string | null;
}

export interface SavedMeal {
  id: string;
  name: string;
  detail: string | null;
  kcal: number;
  items: MealItem[];
  uses: number;
  /** The logged entry this combination was saved from, if any. */
  source_entry_id?: string | null;
}

export interface Goal {
  id: string;
  module_slug: ModuleSlug;
  kind: 'goal' | 'milestone';
  title: string;
  series: string | null;
  target: number | null;
  comparator: '<=' | '>=' | '=' | null;
  cadence: 'daily' | 'weekly' | 'monthly' | 'once';
  due_on: string | null;
  achieved_at: string | null;
  active: boolean;
}

export interface DraftRow {
  id: string;
  draft_id: string;
  module_slug: ModuleSlug;
  label: string | null;
  value: number | null;
  unit: string | null;
  occurred_at: string;
  payload: {
    items?: MealItem[];
    end_page?: number;
    book_id?: string;
    duration_s?: number;
    note?: string;
    [key: string]: unknown;
  };
  match_note: string | null;
  position: number;
}

export interface Draft {
  id: string;
  raw_text: string;
  status: 'pending' | 'approved' | 'discarded';
  parser: string;
  parse_error: string | null;
  created_at: string;
}

export interface Connection {
  id: string;
  status: 'pending' | 'active' | 'declined' | 'revoked';
  created_at: string;
  requester_id: string;
  addressee_id: string;
  other_id: string;
  i_requested: boolean;
  i_share: ModuleSlug[];
  they_share: ModuleSlug[];
  /** Module → "full" | "presence", for what I grant. */
  i_share_detail?: Record<string, ShareDetail>;
  /** Module → level, for what they grant me. */
  they_share_detail?: Record<string, ShareDetail>;
  /** Modules they share that I have chosen not to see. */
  i_mute?: ModuleSlug[];
}

/** "full": values, labels, notes. "presence": only that a day was logged. */
export type ShareDetail = 'full' | 'presence';
export type ShareLevel = 'none' | ShareDetail;

/** One day of one module someone shares with me. */
export interface SharedDayTotal {
  owner_id: string;
  local_date: string;
  module_slug: ModuleSlug;
  detail: ShareDetail;
  entry_count: number;
  /** Null on a presence-only grant. */
  value: number | null;
  unit: string | null;
  measures: Record<string, number> | null;
}

export interface DayClosure {
  module_slug: ModuleSlug;
  local_date: string;
  closed_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  time_zone: string;
  weight_unit: 'lb' | 'kg';
  distance_unit: 'mi' | 'km';
  /** The highlight colour, #RRGGBB. */
  accent_color?: string;
}
