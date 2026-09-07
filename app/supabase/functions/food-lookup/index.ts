// POST /functions/v1/food-lookup
//   { query: "greek yogurt", portion: "170 g" }   → best match, priced
//   { barcode: "0084114..." }                     → Open Food Facts, always
//
// Backs the "No match — set by hand" row in review and the search field in the
// Calories module detail.

import { json, preflight, requireUser, serviceClient } from '../_shared/http.ts';
import { findFood, kcalFor, lookupBarcode, searchOff, searchUsda, type FoodSource } from '../_shared/food.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const { supabase, user } = await requireUser(req);
  if (!user) return json({ error: 'not signed in' }, 401);

  let query = '';
  let barcode = '';
  let portion: string | null = null;
  try {
    const body = await req.json();
    query = String(body.query ?? '').trim();
    barcode = String(body.barcode ?? '').trim();
    portion = body.portion ? String(body.portion) : null;
  } catch {
    return json({ error: 'expected a JSON body' }, 400);
  }

  if (!query && !barcode) return json({ error: 'give a query or a barcode' }, 400);

  const cache = serviceClient();

  if (barcode) {
    const match = await lookupBarcode(barcode);
    if (!match) return json({ match: null, kcal: null, note: 'no product for that barcode' });
    return json({ match, kcal: kcalFor(match, portion), note: 'Open Food Facts' });
  }

  // The user's own preference decides which database is asked first.
  const { data: mod } = await supabase
    .from('user_modules')
    .select('settings')
    .eq('module_slug', 'calories')
    .maybeSingle();

  const order = ((mod?.settings?.source_order as FoodSource[] | undefined) ?? ['usda', 'off']).filter(
    (s) => s === 'usda' || s === 'off',
  );

  const best = await findFood(cache, query, order.length ? order : ['usda', 'off']);

  // Offer the other database as an alternative, so a bad first match is one tap
  // from a better one rather than a dead end.
  const alternates = [];
  for (const source of order) {
    if (best && best.source === source) continue;
    const other = source === 'usda' ? await searchUsda(query) : await searchOff(query);
    if (other) alternates.push({ match: other, kcal: kcalFor(other, portion) });
  }

  return json({
    match: best,
    kcal: best ? kcalFor(best, portion) : null,
    alternates,
    note: best ? `${best.source === 'usda' ? 'USDA FoodData Central' : 'Open Food Facts'}` : 'no match — set by hand',
  });
});
