// Pricing a line of food against USDA FoodData Central and Open Food Facts.
//
// Order is the user's (Calories module setting `source_order`), barcodes always
// resolve through Open Food Facts. Anything we cannot price comes back null so
// the review row can say "No match — set by hand" rather than invent a number.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type FoodSource = 'usda' | 'off' | 'manual' | 'saved';

export interface FoodMatch {
  name: string;
  brand: string | null;
  source: FoodSource;
  ref: string | null;
  kcalPer100g: number | null;
  kcalPerServing: number | null;
  servingLabel: string | null;
}

export interface PricedItem {
  name: string;
  portion: string | null;
  kcal: number | null;
  match_source: FoodSource;
  match_ref: string | null;
  matched_name: string | null;
}

const USER_AGENT = 'Regi/0.1 (habit tracker; contact via repo laffan/regi)';
const CACHE_DAYS = 30;

// ── portions ────────────────────────────────────────────────────────────────

/** "80 g" → 80, "250 ml" → 250 (treated as grams), "1 medium" → null. */
export function gramsIn(portion: string | null): number | null {
  if (!portion) return null;
  const m = portion.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|ml|millilitres|milliliters)\b/i);
  if (m) return Number(m[1]);
  const oz = portion.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/i);
  if (oz) return Number(oz[1]) * 28.35;
  return null;
}

/** "2 slices" → 2, "1 medium" → 1, "a handful" → 1. */
export function countIn(portion: string | null): number {
  if (!portion) return 1;
  const m = portion.match(/^\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 1;
}

export function kcalFor(match: FoodMatch, portion: string | null): number | null {
  const grams = gramsIn(portion);
  if (grams !== null && match.kcalPer100g !== null) {
    return Math.round((match.kcalPer100g * grams) / 100);
  }
  if (match.kcalPerServing !== null) {
    return Math.round(match.kcalPerServing * countIn(portion));
  }
  // No weight given and no per-serving figure: a 100 g reference portion is the
  // honest default, and the review screen lets the number be corrected.
  if (match.kcalPer100g !== null) {
    return Math.round(match.kcalPer100g * countIn(portion));
  }
  return null;
}

// ── cache ───────────────────────────────────────────────────────────────────

async function cacheGet(
  db: SupabaseClient,
  query: string,
  source: FoodSource,
): Promise<FoodMatch | null> {
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data } = await db
    .from('food_cache')
    .select('ref,name,brand,kcal_per_100g,kcal_per_serving,serving_label')
    .eq('source', source)
    .eq('query', query.toLowerCase())
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    name: data.name,
    brand: data.brand,
    source,
    ref: data.ref,
    kcalPer100g: data.kcal_per_100g,
    kcalPerServing: data.kcal_per_serving,
    servingLabel: data.serving_label,
  };
}

async function cachePut(db: SupabaseClient, query: string, match: FoodMatch): Promise<void> {
  await db.from('food_cache').upsert(
    {
      query: query.toLowerCase(),
      source: match.source,
      ref: match.ref ?? '',
      name: match.name,
      brand: match.brand,
      kcal_per_100g: match.kcalPer100g,
      kcal_per_serving: match.kcalPerServing,
      serving_label: match.servingLabel,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'source,ref,query' },
  );
}

// ── USDA FoodData Central ───────────────────────────────────────────────────

export async function searchUsda(query: string): Promise<FoodMatch | null> {
  const key = Deno.env.get('USDA_FDC_API_KEY');
  if (!key) return null;

  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', key);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', '3');
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Branded');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;

  const body = await res.json();
  const food = body?.foods?.[0];
  if (!food) return null;

  const energy = (food.foodNutrients ?? []).find(
    (n: Record<string, unknown>) =>
      (n.nutrientId === 1008 || n.nutrientNumber === '208') &&
      String(n.unitName ?? '').toUpperCase() === 'KCAL',
  );

  const per100g = energy?.value != null ? Number(energy.value) : null;
  const servingSize = food.servingSize != null ? Number(food.servingSize) : null;
  const servingUnit = String(food.servingSizeUnit ?? '').toLowerCase();
  const perServing =
    per100g !== null && servingSize !== null && (servingUnit === 'g' || servingUnit === 'ml')
      ? Math.round((per100g * servingSize) / 100)
      : null;

  return {
    name: String(food.description ?? query),
    brand: food.brandOwner ?? food.brandName ?? null,
    source: 'usda',
    ref: String(food.fdcId),
    kcalPer100g: per100g,
    kcalPerServing: perServing,
    servingLabel: servingSize !== null ? `${servingSize} ${servingUnit}` : null,
  };
}

// ── Open Food Facts ─────────────────────────────────────────────────────────

function offMatch(product: Record<string, any>): FoodMatch | null {
  const n = product?.nutriments ?? {};
  const per100g = n['energy-kcal_100g'] != null ? Number(n['energy-kcal_100g']) : null;
  const perServing = n['energy-kcal_serving'] != null ? Number(n['energy-kcal_serving']) : null;
  if (per100g === null && perServing === null) return null;

  return {
    name: String(product.product_name || product.generic_name || '').trim() || 'Unnamed product',
    brand: product.brands ?? null,
    source: 'off',
    ref: String(product.code ?? ''),
    kcalPer100g: per100g,
    kcalPerServing: perServing,
    servingLabel: product.serving_size ?? null,
  };
}

export async function searchOff(query: string): Promise<FoodMatch | null> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '3');
  url.searchParams.set('fields', 'code,product_name,generic_name,brands,nutriments,serving_size');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;

  const body = await res.json();
  for (const product of body?.products ?? []) {
    const match = offMatch(product);
    if (match) return match;
  }
  return null;
}

/** Barcodes always resolve through Open Food Facts, whatever the source order. */
export async function lookupBarcode(code: string): Promise<FoodMatch | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (body?.status !== 1) return null;
  return offMatch(body.product ?? {});
}

// ── the thing the functions actually call ───────────────────────────────────

export async function findFood(
  db: SupabaseClient,
  query: string,
  order: FoodSource[] = ['usda', 'off'],
): Promise<FoodMatch | null> {
  const cleaned = query.trim();
  if (!cleaned) return null;

  for (const source of order) {
    const cached = await cacheGet(db, cleaned, source);
    if (cached) return cached;
  }

  for (const source of order) {
    try {
      const match = source === 'usda' ? await searchUsda(cleaned) : await searchOff(cleaned);
      if (match) {
        await cachePut(db, cleaned, match);
        return match;
      }
    } catch (_err) {
      // A source being down is not a reason to fail the parse; try the next one
      // and let the row fall through to "set by hand".
    }
  }
  return null;
}

export async function priceItems(
  db: SupabaseClient,
  items: { name: string; portion?: string | null; kcal?: number | null }[],
  order: FoodSource[],
): Promise<PricedItem[]> {
  const priced: PricedItem[] = [];

  for (const item of items) {
    if (item.kcal != null && Number.isFinite(item.kcal)) {
      priced.push({
        name: item.name,
        portion: item.portion ?? null,
        kcal: Math.round(Number(item.kcal)),
        match_source: 'manual',
        match_ref: null,
        matched_name: null,
      });
      continue;
    }

    const match = await findFood(db, item.name, order);
    priced.push({
      name: item.name,
      portion: item.portion ?? null,
      kcal: match ? kcalFor(match, item.portion ?? null) : null,
      match_source: match?.source ?? 'manual',
      match_ref: match?.ref ?? null,
      matched_name: match?.name ?? null,
    });
  }

  return priced;
}
