// Every read and write the app makes. RLS decides what comes back, so these
// stay deliberately plain — no user_id filters, no ownership checks in the
// client.

import { supabase, callFunction } from '@/lib/supabase';
import type {
  Book,
  Connection,
  DailyTotal,
  Draft,
  DraftRow,
  Entry,
  Goal,
  MealItem,
  ModuleRow,
  ModuleSlug,
  Profile,
  SavedMeal,
  UserModule,
} from '@/lib/types';

// ── account ─────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', auth.user.id).single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not signed in');
  const { error } = await supabase.from('profiles').update(patch).eq('id', auth.user.id);
  if (error) throw error;
}

// ── modules ─────────────────────────────────────────────────────────────────

export interface ActiveModule extends ModuleRow {
  active: boolean;
  position: number;
  settings: UserModule['settings'];
}

export async function getModules(): Promise<ActiveModule[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const [catalog, mine] = await Promise.all([
    supabase.from('modules').select('*').order('sort_order'),
    supabase.from('user_modules').select('*').eq('user_id', auth.user.id),
  ]);
  if (catalog.error) throw catalog.error;
  if (mine.error) throw mine.error;

  const byslug = new Map((mine.data as UserModule[]).map((m) => [m.module_slug, m]));
  return (catalog.data as ModuleRow[]).map((row) => {
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
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not signed in');
  const { error } = await supabase
    .from('user_modules')
    .upsert({ user_id: auth.user.id, module_slug: slug, active }, { onConflict: 'user_id,module_slug' });
  if (error) throw error;
}

export async function setModuleSettings(slug: ModuleSlug, settings: UserModule['settings']): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not signed in');
  const { error } = await supabase
    .from('user_modules')
    .update({ settings })
    .eq('user_id', auth.user.id)
    .eq('module_slug', slug);
  if (error) throw error;
}

// ── the calendar spine ──────────────────────────────────────────────────────

export async function getDailyTotals(fromISO: string, toISO: string, userId?: string): Promise<DailyTotal[]> {
  let q = supabase
    .from('daily_module_totals')
    .select('*')
    .gte('local_date', fromISO)
    .lte('local_date', toISO)
    .order('local_date', { ascending: false });
  if (userId) q = q.eq('user_id', userId);

  const { data, error } = await q;
  if (error) throw error;
  return data as DailyTotal[];
}

export async function getEntries(fromISO: string, toISO: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entry_feed')
    .select('*')
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

// ── logging ─────────────────────────────────────────────────────────────────

async function insertEntry(row: {
  module_slug: ModuleSlug;
  value: number | null;
  unit: string | null;
  label?: string | null;
  note?: string | null;
  payload?: Record<string, unknown>;
  occurred_at?: string;
}): Promise<Entry> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not signed in');

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: auth.user.id,
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

export const logWords = (words: number) =>
  insertEntry({ module_slug: 'writing', value: words, unit: 'words', label: `${words} words` });

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

export async function getPendingDraft(): Promise<{ draft: Draft; rows: DraftRow[] } | null> {
  const { data: drafts, error } = await supabase
    .from('log_drafts')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!drafts?.length) return null;

  const draft = drafts[0] as Draft;
  const { data: rows, error: rowError } = await supabase
    .from('log_draft_rows')
    .select('*')
    .eq('draft_id', draft.id)
    .order('position');
  if (rowError) throw rowError;

  return { draft, rows: (rows ?? []) as DraftRow[] };
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

export interface FoodLookup {
  match: {
    name: string;
    brand: string | null;
    source: 'usda' | 'off';
    ref: string | null;
  } | null;
  kcal: number | null;
  alternates?: { match: FoodLookup['match']; kcal: number | null }[];
  note: string;
}

export const lookupFood = (query: string, portion?: string | null) =>
  callFunction<FoodLookup>('food-lookup', { query, portion });

// ── module data ─────────────────────────────────────────────────────────────

export async function getBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('status')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Book[];
}

export async function addBook(book: Partial<Book>): Promise<Book> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('books')
    .insert({ user_id: auth.user.id, ...book })
    .select()
    .single();
  if (error) throw error;
  return data as Book;
}

export async function getSavedMeals(): Promise<SavedMeal[]> {
  const { data, error } = await supabase
    .from('saved_meals')
    .select('*')
    .order('uses', { ascending: false });
  if (error) throw error;
  return data as SavedMeal[];
}

export async function getGoals(): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('active', true)
    .order('due_on', { nullsFirst: false });
  if (error) throw error;
  return data as Goal[];
}

export async function addGoal(goal: Partial<Goal>): Promise<Goal> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('goals')
    .insert({ user_id: auth.user.id, ...goal })
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

export async function removeConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.from('connections').delete().eq('id', connectionId);
  if (error) throw error;
}
