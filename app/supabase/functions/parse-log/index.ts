// POST /functions/v1/parse-log  { text: string, now?: ISO string }
//
// Text in → typed draft rows for the review column. Writes nothing to any
// module: approving the draft (public.approve_draft) is what does that.

import { json, preflight, requireUser, serviceClient } from '../_shared/http.ts';
import { fallbackParse, parseWithOpenAI, type ParseContext, type ParsedRow } from '../_shared/parse.ts';
import { priceItems, type FoodSource } from '../_shared/food.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const { supabase, user } = await requireUser(req);
  if (!user) return json({ error: 'not signed in' }, 401);

  let text = '';
  let now = new Date().toISOString();
  try {
    const body = await req.json();
    text = String(body.text ?? '').trim();
    if (body.now) now = new Date(body.now).toISOString();
  } catch {
    return json({ error: 'expected a JSON body' }, 400);
  }
  if (!text) return json({ error: 'nothing to parse' }, 400);

  // ── context the parser needs ──────────────────────────────────────────────
  const [{ data: modules }, { data: profile }, { data: books }, { data: savedMeals }] = await Promise.all([
    supabase.from('user_modules').select('module_slug, active, settings').eq('active', true),
    supabase.from('profiles').select('weight_unit, distance_unit, time_zone').eq('id', user.id).single(),
    supabase
      .from('books')
      .select('id, title, current_page, total_pages')
      .eq('status', 'reading')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('saved_meals').select('id, name, kcal, items').order('uses', { ascending: false }).limit(20),
  ]);

  const activeModules = (modules ?? []).map((m) => m.module_slug as string);
  if (!activeModules.length) return json({ error: 'no active modules' }, 400);

  const calorieSettings = (modules ?? []).find((m) => m.module_slug === 'calories')?.settings ?? {};
  const sourceOrder = (calorieSettings.source_order as FoodSource[] | undefined) ?? ['usda', 'off'];

  const ctx: ParseContext = {
    activeModules,
    weightUnit: (profile?.weight_unit as 'lb' | 'kg') ?? 'lb',
    distanceUnit: (profile?.distance_unit as 'mi' | 'km') ?? 'mi',
    currentBook: books?.[0]
      ? {
          id: books[0].id,
          title: books[0].title,
          current_page: books[0].current_page ?? 0,
          total_pages: books[0].total_pages,
        }
      : null,
    savedMeals: (savedMeals ?? []) as ParseContext['savedMeals'],
    now,
  };

  // ── parse ─────────────────────────────────────────────────────────────────
  let rows: ParsedRow[];
  let parser = 'openai';
  let parseError: string | null = null;

  try {
    rows = await parseWithOpenAI(text, ctx);
    if (!rows.length) {
      // A well-formed empty answer usually means the model found nothing it was
      // sure of; the rule-based pass is often less shy.
      const local = fallbackParse(text, ctx);
      if (local.length) {
        rows = local;
        parser = 'fallback';
      }
    }
  } catch (err) {
    parser = 'fallback';
    parseError = err instanceof Error ? err.message : String(err);
    rows = fallbackParse(text, ctx);
  }

  if (!rows.length) {
    return json({ draft: null, rows: [], parser, parse_error: parseError, message: 'nothing recognised' }, 200);
  }

  // ── price the food ────────────────────────────────────────────────────────
  const cache = serviceClient();

  for (const row of rows) {
    if (row.module !== 'calories') continue;

    const priced = await priceItems(cache, row.items, sourceOrder);
    row.items = priced.map((p) => ({ name: p.name, portion: p.portion, kcal: p.kcal }));

    const matched = priced.filter((p) => p.kcal !== null);
    const total = matched.reduce((sum, p) => sum + (p.kcal ?? 0), 0);
    row.value = matched.length ? total : null;

    if (row.match_note === null || row.match_note === undefined) {
      const usda = priced.filter((p) => p.match_source === 'usda').length;
      const off = priced.filter((p) => p.match_source === 'off').length;
      const unmatched = priced.length - matched.length;

      const parts: string[] = [];
      if (usda) parts.push(`USDA · ${usda} match${usda > 1 ? 'es' : ''}`);
      if (off) parts.push(`Open Food Facts · ${off}`);
      if (unmatched) parts.push(`${unmatched} to price by hand`);
      row.match_note = parts.join(' · ') || 'no match — set by hand';
    }

    // Carry the priced items into the row payload the review screen edits.
    (row as ParsedRow & { priced?: unknown }).priced = priced;
  }

  // ── store the draft ───────────────────────────────────────────────────────
  const { data: draft, error: draftError } = await supabase
    .from('log_drafts')
    .insert({ user_id: user.id, raw_text: text, parser, parse_error: parseError })
    .select()
    .single();

  if (draftError || !draft) return json({ error: draftError?.message ?? 'could not open a draft' }, 500);

  const draftRows = rows.map((row, index) => ({
    draft_id: draft.id,
    user_id: user.id,
    module_slug: row.module,
    label: row.label,
    value: row.value,
    unit: row.unit,
    occurred_at: row.occurred_at ?? now,
    payload: {
      ...(row.items.length ? { items: (row as ParsedRow & { priced?: unknown }).priced ?? row.items } : {}),
      ...(row.end_page !== null ? { end_page: row.end_page } : {}),
      ...(row.book_id ? { book_id: row.book_id } : {}),
      ...(row.duration_seconds !== null ? { duration_s: row.duration_seconds } : {}),
      ...(row.note ? { note: row.note } : {}),
    },
    match_note: row.match_note,
    position: index,
  }));

  const { data: stored, error: rowError } = await supabase
    .from('log_draft_rows')
    .insert(draftRows)
    .select();

  if (rowError) return json({ error: rowError.message }, 500);

  return json({ draft, rows: stored, parser, parse_error: parseError });
});
