// Every read and write the app makes. RLS decides what may come back; the
// client still filters its own reads to the signed-in account, because RLS
// also lets a connection's shared rows through, and those belong in the
// "shared with you" surfaces, not mixed into your own week.

import { supabase, callFunction } from '@/lib/supabase';
import type {
  Book,
  Connection,
  ProjectWithTotals,
  WritingMeasure,
  WritingProject,
  WritingProjectTotals,
  DailyTotal,
  DayClosure,
  Draft,
  DraftRow,
  Entry,
  Goal,
  MealItem,
  ModuleRow,
  ModuleSlug,
  Profile,
  SavedMeal,
  ShareLevel,
  SharedDayTotal,
  UserModule,
  IconNode,
} from '@/lib/types';
import { registerModules } from '@/modules/registry';

/** The signed-in account, from the local session — no network round trip. */
async function myId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('not signed in');
  return id;
}

async function maybeMyId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// ── account ─────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<Profile | null> {
  const me = await maybeMyId();
  if (!me) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', me).single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  const me = await myId();
  const { error } = await supabase.from('profiles').update(patch).eq('id', me);
  if (error) throw error;
}

/** The database's schema version, or null when it predates the check. */
export async function getSchemaVersion(): Promise<string | null> {
  const { data, error } = await supabase.rpc('schema_version');
  if (error) return null;
  return typeof data === 'string' ? data : null;
}

// ── modules ─────────────────────────────────────────────────────────────────

export interface ActiveModule extends ModuleRow {
  active: boolean;
  position: number;
  settings: UserModule['settings'];
}

export async function getModules(): Promise<ActiveModule[]> {
  const me = await maybeMyId();
  if (!me) return [];

  const [catalog, mine] = await Promise.all([
    supabase.from('modules').select('*').order('sort_order'),
    supabase.from('user_modules').select('*').eq('user_id', me),
  ]);
  if (catalog.error) throw catalog.error;
  if (mine.error) throw mine.error;

  // The catalog also carries trackers other people share with you, so their
  // days have a name and an icon. Register them all; list only your own.
  const rows = catalog.data as ModuleRow[];
  registerModules(rows);

  const byslug = new Map((mine.data as UserModule[]).map((m) => [m.module_slug, m]));
  return rows.filter((row) => !row.owner_id || row.owner_id === me).map((row) => {
    const state = byslug.get(row.slug);
    return {
      ...row,
      active: state?.active ?? false,
      position: state?.position ?? row.sort_order,
      settings: state?.settings ?? {},
    };
  });
}

export async function setModuleActive(slug: ModuleSlug, active: boolean): Promise<void> {
  const me = await myId();
  const { error } = await supabase
    .from('user_modules')
    .upsert({ user_id: me, module_slug: slug, active }, { onConflict: 'user_id,module_slug' });
  if (error) throw error;
}

export async function setModuleSettings(slug: ModuleSlug, settings: UserModule['settings']): Promise<void> {
  const me = await myId();
  const { error } = await supabase
    .from('user_modules')
    .update({ settings })
    .eq('user_id', me)
    .eq('module_slug', slug);
  if (error) throw error;
}

// ── activity trackers ───────────────────────────────────────────────────────

export interface TrackerInput {
  name: string;
  icon: string;
  nodes: IconNode;
}

export async function createActivity({ name, icon, nodes }: TrackerInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_activity_module', {
    p_name: name,
    p_icon: icon,
    p_icon_nodes: nodes,
  });
  if (error) throw error;
  return data as string;
}

export async function updateActivity(slug: string, { name, icon, nodes }: TrackerInput): Promise<void> {
  const { error } = await supabase.rpc('update_activity_module', {
    p_slug: slug,
    p_name: name,
    p_icon: icon,
    p_icon_nodes: nodes,
  });
  if (error) throw error;
}

export async function deleteActivity(slug: string): Promise<void> {
  const { error } = await supabase.rpc('delete_activity_module', { p_slug: slug });
  if (error) throw error;
}

/**
 * The tracker's one question. "I did!" records the day; "Not today" removes
 * that record — a day with no entry is a day it wasn't done.
 */
export async function setActivityDone(slug: string, name: string, date: string, done: boolean): Promise<void> {
  const me = await myId();
  if (done) {
    const { data: existing, error: readError } = await supabase
      .from('entries')
      .select('id')
      .eq('user_id', me)
      .eq('module_slug', slug)
      .eq('local_date', date)
      .limit(1);
    if (readError) throw readError;
    if (existing?.length) return;
    await insertEntry({ module_slug: slug, value: 1, unit: 'done', label: name, local_date: date });
  } else {
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('user_id', me)
      .eq('module_slug', slug)
      .eq('local_date', date);
    if (error) throw error;
  }
}

// ── the calendar spine ──────────────────────────────────────────────────────

export async function getDailyTotals(fromISO: string, toISO: string, userId?: string): Promise<DailyTotal[]> {
  const { data, error } = await supabase
    .from('daily_module_totals')
    .select('*')
    .eq('user_id', userId ?? (await myId()))
    .gte('local_date', fromISO)
    .lte('local_date', toISO)
    .order('local_date', { ascending: false });
  if (error) throw error;
  return data as DailyTotal[];
}

/** What connections share with you, at the level each grant allows, minus what you have hidden. */
export async function getSharedTotals(fromISO: string, toISO: string): Promise<SharedDayTotal[]> {
  const { data, error } = await supabase.rpc('shared_daily_totals', { p_from: fromISO, p_to: toISO });
  if (error) throw error;
  return (data ?? []) as SharedDayTotal[];
}

export async function getDayClosures(fromISO: string, toISO: string): Promise<DayClosure[]> {
  const { data, error } = await supabase
    .from('day_closures')
    .select('module_slug, local_date, closed_at')
    .eq('user_id', await myId())
    .gte('local_date', fromISO)
    .lte('local_date', toISO);
  if (error) throw error;
  return (data ?? []) as DayClosure[];
}

/** "Last meal of the day": the day's count is complete. Toggling reopens it. */
export async function setDayClosed(slug: ModuleSlug, date: string, closed: boolean): Promise<void> {
  const me = await myId();
  const q = closed
    ? supabase
        .from('day_closures')
        .upsert({ user_id: me, module_slug: slug, local_date: date }, { onConflict: 'user_id,module_slug,local_date' })
    : supabase.from('day_closures').delete().eq('user_id', me).eq('module_slug', slug).eq('local_date', date);
  const { error } = await q;
  if (error) throw error;
}

export async function getEntries(fromISO: string, toISO: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entry_feed')
    .select('*')
    .eq('user_id', await myId())
    .gte('local_date', fromISO)
    .lte('local_date', toISO)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data as Entry[];
}

export async function getSeries(series: string, fromISO: string, toISO: string) {
  const { data, error } = await supabase
    .from('published_series')
    .select('local_date, value, unit, module_slug')
    .eq('user_id', await myId())
    .eq('series', series)
    .gte('local_date', fromISO)
    .lte('local_date', toISO)
    .order('local_date');
  if (error) throw error;
  return (data ?? []).map((r) => ({ date: r.local_date as string, value: Number(r.value) }));
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}

/** Editing a logged entry: what it says, how much, when, and its note. */
export interface EntryPatch {
  label?: string | null;
  value?: number | null;
  note?: string | null;
  occurred_at?: string;
  local_date?: string;
  payload?: Entry['payload'];
}

export async function updateEntry(id: string, patch: EntryPatch): Promise<void> {
  const { error } = await supabase.from('entries').update(patch).eq('id', id);
  if (error) throw error;
}

/** A logged meal, edited: its items are replaced and the total re-summed on the server. */
export async function updateMeal(
  id: string,
  input: { label: string; items: MealItem[]; occurred_at: string; local_date: string; note: string | null },
): Promise<void> {
  const { error } = await supabase.rpc('update_meal', {
    p_entry_id: id,
    p_label: input.label,
    p_items: input.items,
    p_occurred_at: input.occurred_at,
    p_local_date: input.local_date,
    p_note: input.note ?? '',
  });
  if (error) throw error;
}

// ── logging ─────────────────────────────────────────────────────────────────

async function insertEntry(row: {
  module_slug: ModuleSlug;
  value: number | null;
  unit: string | null;
  label?: string | null;
  note?: string | null;
  payload?: Record<string, unknown>;
  occurred_at?: string;
  local_date?: string;
}): Promise<Entry> {
  const me = await myId();

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: me,
      occurred_at: row.occurred_at ?? new Date().toISOString(),
      payload: row.payload ?? {},
      ...row,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Entry;
}

export const logWeight = (value: number, unit: 'lb' | 'kg') =>
  insertEntry({ module_slug: 'weight', value, unit, label: value.toFixed(1) });

export const logPages = (pages: number, book: Book | null, note?: string) =>
  insertEntry({
    module_slug: 'reading',
    value: pages,
    unit: 'pages',
    label: book?.title ?? 'Reading',
    note: note ?? null,
    payload: book ? { book_id: book.id, end_page: book.current_page + pages } : {},
  });

export const logRun = (miles: number, unit: 'mi' | 'km', seconds: number | null) =>
  insertEntry({
    module_slug: 'running',
    value: miles,
    unit,
    label: `${miles.toFixed(1)} ${unit}`,
    payload: seconds ? { duration_s: seconds } : {},
  });

export const logSleep = (hours: number) =>
  insertEntry({ module_slug: 'sleep', value: hours, unit: 'h', label: `${hours} h` });

export async function logMeal(label: string, items: MealItem[], occurredAt?: string): Promise<string> {
  const { data, error } = await supabase.rpc('log_meal', {
    p_label: label,
    p_items: items,
    p_occurred_at: occurredAt ?? new Date().toISOString(),
  });
  if (error) throw error;
  return data as string;
}

export async function logSavedMeal(savedMealId: string): Promise<string> {
  const { data, error } = await supabase.rpc('log_saved_meal', { p_saved_meal_id: savedMealId });
  if (error) throw error;
  return data as string;
}

export async function saveMealFromEntry(entryId: string, name: string, itemIds?: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('save_meal_from_entry', {
    p_entry_id: entryId,
    p_name: name,
    p_item_ids: itemIds ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ── the log's parse / review / approve loop ─────────────────────────────────

export interface ParseResult {
  draft: Draft | null;
  rows: DraftRow[];
  parser: string;
  parse_error: string | null;
  message?: string;
}

export const parseLog = (text: string) =>
  callFunction<ParseResult>('parse-log', { text, now: new Date().toISOString() });

export interface PendingDraft {
  draft: Draft;
  rows: DraftRow[];
}

/**
 * Every draft still waiting for review, oldest first. Lines can be sent faster
 * than they are reviewed — from the Log and from a widget — so the review
 * column holds all of them, not just the latest.
 */
export async function getPendingDrafts(): Promise<PendingDraft[]> {
  const { data: drafts, error } = await supabase
    .from('log_drafts')
    .select('*')
    .eq('user_id', await myId())
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!drafts?.length) return [];

  const { data: rows, error: rowError } = await supabase
    .from('log_draft_rows')
    .select('*')
    .in('draft_id', drafts.map((d) => d.id))
    .order('position');
  if (rowError) throw rowError;

  return (drafts as Draft[]).map((draft) => ({
    draft,
    rows: ((rows ?? []) as DraftRow[]).filter((r) => r.draft_id === draft.id),
  }));
}

export async function updateDraftRow(id: string, patch: Partial<DraftRow>): Promise<void> {
  const { error } = await supabase.from('log_draft_rows').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteDraftRow(id: string): Promise<void> {
  const { error } = await supabase.from('log_draft_rows').delete().eq('id', id);
  if (error) throw error;
}

export async function approveDraft(draftId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('approve_draft', { p_draft_id: draftId });
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function discardDraft(draftId: string): Promise<void> {
  const { error } = await supabase.rpc('discard_draft', { p_draft_id: draftId });
  if (error) throw error;
}

/** A priced item and the other sources' answers, each saying where it came from. */
export interface FoodLookup {
  item: MealItem | null;
  alternates: MealItem[];
  note: string;
}

export const lookupFood = (query: string, portion?: string | null) =>
  callFunction<FoodLookup>('food-lookup', { query, portion });

/** A phrase — "two eggs and toast" — split into food and priced, for appending to a meal. */
export const lookupFoodText = (text: string) =>
  callFunction<{ items: MealItem[]; note: string }>('food-lookup', { text });

/**
 * The device's time zone, so a calendar day means the same thing here as on
 * the server. Returns true when the profile changed.
 */
export async function setTimeZone(tz: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_time_zone', { p_tz: tz });
  if (error) throw error;
  return Boolean(data);
}

/** Voice logging: speech in, text out. The text goes to the input line for review. */
export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  const ext = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('audio', audio, `speech.${ext}`);
  const { data, error } = await supabase.functions.invoke<{ text: string }>('transcribe', { body: form });
  if (error) {
    // The function answers 501 with a reason when no key is configured.
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  return data?.text ?? '';
}

// ── module data ─────────────────────────────────────────────────────────────

export async function getBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', await myId())
    .order('status')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Book[];
}

export async function addBook(book: Partial<Book>): Promise<Book> {
  const me = await myId();
  const { data, error } = await supabase
    .from('books')
    .insert({ user_id: me, ...book })
    .select()
    .single();
  if (error) throw error;
  return data as Book;
}

// ── writing ─────────────────────────────────────────────────────────────────

/**
 * Projects with their totals. The totals are a view over the sessions, never
 * stored, so editing or deleting a session can't leave a project's count
 * drifting.
 */
export async function getWritingProjects(): Promise<ProjectWithTotals[]> {
  const me = await myId();
  const [projects, totals] = await Promise.all([
    supabase.from('writing_projects').select('*').eq('user_id', me).order('status').order('position'),
    supabase.from('writing_project_totals').select('*').eq('user_id', me),
  ]);
  if (projects.error) throw projects.error;
  if (totals.error) throw totals.error;

  const byId = new Map(
    (totals.data as WritingProjectTotals[]).map((row) => [row.project_id, row]),
  );

  return (projects.data as WritingProject[]).map((project) => {
    const sums = byId.get(project.id);
    return {
      ...project,
      words: Number(sums?.words ?? 0),
      minutes: Number(sums?.minutes ?? 0),
      sessions: Number(sums?.sessions ?? 0),
      last_on: sums?.last_on ?? null,
    };
  });
}

export async function addWritingProject(project: Partial<WritingProject>): Promise<WritingProject> {
  const me = await myId();
  const { data, error } = await supabase
    .from('writing_projects')
    .insert({ user_id: me, ...project })
    .select()
    .single();
  if (error) throw error;
  return data as WritingProject;
}

export async function updateWritingProject(id: string, patch: Partial<WritingProject>): Promise<void> {
  const { error } = await supabase.from('writing_projects').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * A session, measured in one unit or the other. A project is the normal case;
 * a line typed into the Log without naming one still records, it just does not
 * count towards any project's total.
 */
export const logWritingSession = (
  project: WritingProject | null,
  amount: number,
  measure: WritingMeasure,
  note?: string,
) =>
  insertEntry({
    module_slug: 'writing',
    value: amount,
    unit: measure,
    label: project?.title ?? (measure === 'words' ? `${amount} words` : `${amount} min`),
    note: note ?? null,
    payload: project ? { project_id: project.id } : {},
  });

export async function getSavedMeals(): Promise<SavedMeal[]> {
  const { data, error } = await supabase
    .from('saved_meals')
    .select('*')
    .order('uses', { ascending: false });
  if (error) throw error;
  return data as SavedMeal[];
}

/** Recurring goals only — milestones are switched off for now. */
export async function getGoals(): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', await myId())
    .eq('kind', 'goal')
    .eq('active', true)
    .order('due_on', { nullsFirst: false });
  if (error) throw error;
  return data as Goal[];
}

export async function addGoal(goal: Partial<Goal>): Promise<Goal> {
  const me = await myId();
  const { data, error } = await supabase
    .from('goals')
    .insert({ user_id: me, ...goal })
    .select()
    .single();
  if (error) throw error;
  return data as Goal;
}

// ── sharing ─────────────────────────────────────────────────────────────────

export interface ConnectionWithPerson extends Connection {
  person: { id: string; email: string; display_name: string | null } | null;
}

export async function getConnections(): Promise<ConnectionWithPerson[]> {
  const { data, error } = await supabase.from('my_connections').select('*');
  if (error) throw error;

  const rows = (data ?? []) as Connection[];
  if (!rows.length) return [];

  const { data: people, error: peopleError } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .in('id', rows.map((r) => r.other_id));
  if (peopleError) throw peopleError;

  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, person: byId.get(r.other_id) ?? null }));
}

export async function findPerson(email: string) {
  const { data, error } = await supabase.rpc('find_person', { p_email: email });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; email: string; display_name: string | null }[];
  return rows[0] ?? null;
}

export async function requestConnection(email: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_connection', { p_email: email });
  if (error) throw error;
  return data as string;
}

export async function respondToConnection(connectionId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_connection', {
    p_connection_id: connectionId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function setModuleShare(
  connectionId: string,
  slug: ModuleSlug,
  granted: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_module_share', {
    p_connection_id: connectionId,
    p_module_slug: slug,
    p_granted: granted,
  });
  if (error) throw error;
}

/** What you send: nothing, presence only, or the full detail. */
export async function setShareLevel(connectionId: string, slug: ModuleSlug, level: ShareLevel): Promise<void> {
  const { error } = await supabase.rpc('set_module_share_level', {
    p_connection_id: connectionId,
    p_module_slug: slug,
    p_level: level,
  });
  if (error) throw error;
}

/** What you receive: hide a module someone shares with you, or show it again. */
export async function setReceive(connectionId: string, slug: ModuleSlug, show: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_receive', {
    p_connection_id: connectionId,
    p_module_slug: slug,
    p_show: show,
  });
  if (error) throw error;
}

export async function removeConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.from('connections').delete().eq('id', connectionId);
  if (error) throw error;
}
