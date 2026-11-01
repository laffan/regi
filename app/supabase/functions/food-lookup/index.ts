// POST /functions/v1/food-lookup
//   { query: "greek yogurt", portion: "170 g" }   → best item, priced, plus alternates
//   { barcode: "0084114...", portion?: "28 g" }   → Open Food Facts, always
//
// Backs the "No match — set by hand" row in review, the edit dialog's
// "Look up" button, and the Calories module. Every answer is a priced item
// carrying its source, what it matched and the arithmetic, so the client never
// shows a number without saying where it came from.

import { json, preflight, requireUser, serviceClient } from '../_shared/http.ts';
import {
  estimateWithOpenAI,
  findInDatabase,
  lookupBarcode,
  priceFor,
  sourceOrder,
  type PricedItem,
} from '../_shared/food.ts';

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
    if (!match) return json({ item: null, alternates: [], note: 'no product for that barcode' });
    const price = priceFor(match, portion);
    const item: PricedItem = {
      name: match.name,
      portion,
      kcal: price.kcal,
      match_source: 'off',
      match_ref: match.ref,
      matched_name: match.brand ? `${match.name} (${match.brand})` : match.name,
      basis: price.basis,
      ...price.macros,
    };
    return json({ item, alternates: [], note: 'Open Food Facts' });
  }

  // The user's own preference decides which source is asked first.
  const { data: mod } = await supabase
    .from('user_modules')
    .select('settings')
    .eq('module_slug', 'calories')
    .eq('user_id', user.id)
    .maybeSingle();

  const order = sourceOrder(mod?.settings?.source_order);

  // Ask every enabled source, so a poor first answer is one tap from another.
  const answers: PricedItem[] = [];
  for (const source of order) {
    if (source === 'openai') {
      const [est] = await estimateWithOpenAI([{ name: query, portion }]);
      if (est) answers.push({ name: query, portion, ...est });
      continue;
    }
    const match = await findInDatabase(cache, query, source);
    if (!match) continue;
    const price = priceFor(match, portion);
    if (price.kcal === null) continue;
    answers.push({
      name: query,
      portion,
      kcal: price.kcal,
      match_source: match.source,
      match_ref: match.ref,
      matched_name: match.brand ? `${match.name} (${match.brand})` : match.name,
      basis: price.basis,
      ...price.macros,
    });
  }

  const [item = null, ...alternates] = answers;
  const label = { usda: 'USDA FoodData Central', off: 'Open Food Facts', openai: 'OpenAI estimate' } as const;

  return json({
    item,
    alternates,
    note: item ? label[item.match_source as keyof typeof label] ?? 'matched' : 'no match — set by hand',
  });
});
