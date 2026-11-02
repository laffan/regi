// Pricing a line of food: energy and macros, and a record of how each number
// was reached.
//
// Sources, in the order the user picks (Calories setting `source_order`):
//   usda    USDA FoodData Central — a database lookup
//   off     Open Food Facts — a database lookup; barcodes always go here
//   openai  an estimate from OpenAI, used when it is in the order and the
//           sources ahead of it found nothing
//
// Accuracy and transparency come first. Every priced item carries what it was
// matched to (`matched_name`, `match_ref`) and the arithmetic (`basis`), and an
// OpenAI figure is always labelled an estimate. Anything nobody could price
// comes back null so the review row says "No match — set by hand" rather than
// inventing a number.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { chatJSON, NUTRITION_MODEL, openAIKey } from './openai.ts';
import { resolveGrams, type Measure, type PortionSource } from './portion.ts';

export type FoodSource = 'usda' | 'off' | 'openai' | 'manual' | 'saved';
export type LookupSource = 'usda' | 'off' | 'openai';

export interface Macros {
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
}

const NO_MACROS: Macros = { protein_g: null, carbs_g: null, fat_g: null, fiber_g: null };

export interface FoodMatch {
  name: string;
  brand: string | null;
  source: 'usda' | 'off';
  ref: string | null;
  kcalPer100g: number | null;
  kcalPerServing: number | null;
  servingLabel: string | null;
  macrosPer100g: Macros;
  macrosPerServing: Macros;
  /** Household portions with their weights: USDA's "1 cup = 245 g". */
  measures: Measure[];
  /** One serving as sold, in grams (ml for drinks). */
  servingGrams: number | null;
}

export interface PricedItem extends Macros {
  name: string;
  portion: string | null;
  kcal: number | null;
  match_source: FoodSource;
  match_ref: string | null;
  matched_name: string | null;
  basis: string | null;
  /** The weight the figures are for, when known. */
  grams: number | null;
  /** Where that weight came from: the text, a database portion, an estimate, or an assumption. */
  portion_source: PortionSource | null;
}

const USER_AGENT = 'Regi/0.1 (habit tracker; contact via repo laffan/regi)';
const CACHE_DAYS = 30;

export function sourceOrder(raw: unknown): LookupSource[] {
  const list = Array.isArray(raw) ? raw : ['usda', 'off', 'openai'];
  const clean = list.filter((s): s is LookupSource => s === 'usda' || s === 'off' || s === 'openai');
  return clean.length ? [...new Set(clean)] : ['usda', 'off', 'openai'];
}

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

const round1 = (n: number) => Math.round(n * 10) / 10;

function scaleMacros(m: Macros, factor: number): Macros {
  const s = (v: number | null) => (v === null ? null : round1(v * factor));
  return { protein_g: s(m.protein_g), carbs_g: s(m.carbs_g), fat_g: s(m.fat_g), fiber_g: s(m.fiber_g) };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Energy and macros for a portion of a match, and the sentence that explains
 * the arithmetic. The weight comes from resolveGrams — stated, a database
 * portion, an estimate — and only when there is none does a per-serving
 * figure or an assumed 100 g stand in, each saying so.
 */
export function priceFor(
  match: FoodMatch,
  portion: string | null,
  detail: Omit<ItemIn, 'name' | 'portion'> = {},
): { kcal: number | null; macros: Macros; basis: string | null; grams: number | null; portion_source: PortionSource | null } {
  const sourceName = match.source === 'usda' ? 'USDA' : 'Open Food Facts';
  const weight = resolveGrams(
    { portion, quantity: detail.quantity, unit: detail.unit, grams_estimate: detail.grams_estimate, approximate: detail.approximate },
    { measures: match.measures, servingGrams: match.servingGrams, sourceName },
  );

  if (weight && match.kcalPer100g !== null) {
    return {
      kcal: Math.round((match.kcalPer100g * weight.grams) / 100),
      macros: scaleMacros(match.macrosPer100g, weight.grams / 100),
      basis: `${weight.how} × ${fmt(match.kcalPer100g)} kcal/100 g`,
      grams: round1(weight.grams),
      portion_source: weight.source,
    };
  }

  const count = detail.quantity ?? countIn(portion);
  if (match.kcalPerServing !== null) {
    return {
      kcal: Math.round(match.kcalPerServing * count),
      macros: scaleMacros(match.macrosPerServing, count),
      basis: `${fmt(count)} × ${fmt(match.kcalPerServing)} kcal per serving${
        match.servingLabel ? ` (${match.servingLabel})` : ''
      }`,
      grams: match.servingGrams ? round1(match.servingGrams * count) : null,
      portion_source: 'database',
    };
  }
  if (match.kcalPer100g !== null) {
    return {
      kcal: Math.round(match.kcalPer100g * count),
      macros: scaleMacros(match.macrosPer100g, count),
      basis: `no amount to go on — assumed ${fmt(count * 100)} g at ${fmt(match.kcalPer100g)} kcal/100 g`,
      grams: count * 100,
      portion_source: 'assumed',
    };
  }
  return { kcal: null, macros: NO_MACROS, basis: null, grams: null, portion_source: null };
}

/** Kept for callers that only want the number. */
export function kcalFor(match: FoodMatch, portion: string | null): number | null {
  return priceFor(match, portion).kcal;
}

// ── cache ───────────────────────────────────────────────────────────────────

async function cacheGet(db: SupabaseClient, query: string, source: 'usda' | 'off'): Promise<FoodMatch | null> {
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data } = await db
    .from('food_cache')
    .select('ref,name,brand,kcal_per_100g,kcal_per_serving,serving_label,payload')
    .eq('source', source)
    .eq('query', query.toLowerCase())
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // A cached row from before macros and portions were recorded is re-fetched
  // rather than served without them.
  if (!data || data.payload?.v !== 2) return null;
  return {
    name: data.name,
    brand: data.brand,
    source,
    ref: data.ref,
    kcalPer100g: data.kcal_per_100g,
    kcalPerServing: data.kcal_per_serving,
    servingLabel: data.serving_label,
    macrosPer100g: data.payload.macros_per_100g ?? NO_MACROS,
    macrosPerServing: data.payload.macros_per_serving ?? NO_MACROS,
    measures: data.payload.measures ?? [],
    servingGrams: data.payload.serving_grams ?? null,
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
      payload: {
        v: 2,
        macros_per_100g: match.macrosPer100g,
        macros_per_serving: match.macrosPerServing,
        measures: match.measures,
        serving_grams: match.servingGrams,
      },
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'source,ref,query' },
  );
}

// ── USDA FoodData Central ───────────────────────────────────────────────────

// Nutrient ids, with the legacy nutrient numbers some responses use instead.
const USDA = {
  energy: [1008, '208'],
  protein: [1003, '203'],
  fat: [1004, '204'],
  carbs: [1005, '205'],
  fiber: [1079, '291'],
} as const;

function usdaNutrient(food: Record<string, any>, [id, number]: readonly [number, string], unit?: string): number | null {
  const hit = (food.foodNutrients ?? []).find(
    (n: Record<string, unknown>) =>
      (n.nutrientId === id || n.nutrientNumber === number) &&
      (!unit || String(n.unitName ?? '').toUpperCase() === unit),
  );
  return hit?.value != null ? Number(hit.value) : null;
}

/**
 * Generic foods are looked up in USDA's survey database (FNDDS) first — it
 * carries household portions with weights ("1 cup = 245 g") — then Foundation
 * and SR Legacy. A named brand goes to USDA's Branded Foods instead, so "Red
 * Bull" does not come back as a generic energy drink, or the reverse.
 */
export async function searchUsda(query: string, branded = false): Promise<FoodMatch | null> {
  const key = Deno.env.get('USDA_FDC_API_KEY');
  if (!key) return null;

  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', key);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', '3');
  url.searchParams.set('dataType', branded ? 'Branded' : 'Survey (FNDDS),Foundation,SR Legacy');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;

  const body = await res.json();
  const food = body?.foods?.[0];
  if (!food) return null;

  // Search results report nutrients per 100 g for every data type.
  const per100g = usdaNutrient(food, USDA.energy, 'KCAL');
  const macros100: Macros = {
    protein_g: usdaNutrient(food, USDA.protein),
    carbs_g: usdaNutrient(food, USDA.carbs),
    fat_g: usdaNutrient(food, USDA.fat),
    fiber_g: usdaNutrient(food, USDA.fiber),
  };

  const servingSize = food.servingSize != null ? Number(food.servingSize) : null;
  const servingUnit = String(food.servingSizeUnit ?? '').toLowerCase();
  const servingGrams = servingSize !== null && (servingUnit === 'g' || servingUnit === 'ml') ? servingSize : null;

  return {
    name: String(food.description ?? query),
    brand: food.brandOwner ?? food.brandName ?? null,
    source: 'usda',
    ref: String(food.fdcId),
    kcalPer100g: per100g,
    kcalPerServing: per100g !== null && servingGrams !== null ? Math.round((per100g * servingGrams) / 100) : null,
    servingLabel: servingSize !== null ? `${servingSize} ${servingUnit}` : null,
    macrosPer100g: macros100,
    macrosPerServing: servingGrams !== null ? scaleMacros(macros100, servingGrams / 100) : NO_MACROS,
    measures: ((food.foodMeasures ?? []) as Record<string, any>[])
      .filter((m) => Number(m.gramWeight) > 0 && m.disseminationText)
      .sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0))
      .map((m) => ({ text: String(m.disseminationText), grams: Number(m.gramWeight) })),
    servingGrams,
  };
}

// ── Open Food Facts ─────────────────────────────────────────────────────────

function offNumber(n: Record<string, unknown>, key: string): number | null {
  const v = n[key] != null && n[key] !== '' ? Number(n[key]) : null;
  return v !== null && Number.isFinite(v) ? v : null;
}

function offMatch(product: Record<string, any>): FoodMatch | null {
  const n = product?.nutriments ?? {};
  const per100g = offNumber(n, 'energy-kcal_100g');
  const perServing = offNumber(n, 'energy-kcal_serving');
  if (per100g === null && perServing === null) return null;

  const macros = (suffix: string): Macros => ({
    protein_g: offNumber(n, `proteins_${suffix}`),
    carbs_g: offNumber(n, `carbohydrates_${suffix}`),
    fat_g: offNumber(n, `fat_${suffix}`),
    fiber_g: offNumber(n, `fiber_${suffix}`),
  });

  return {
    name: String(product.product_name || product.generic_name || '').trim() || 'Unnamed product',
    brand: product.brands ?? null,
    source: 'off',
    ref: String(product.code ?? ''),
    kcalPer100g: per100g,
    kcalPerServing: perServing,
    servingLabel: product.serving_size ?? null,
    macrosPer100g: macros('100g'),
    macrosPerServing: macros('serving'),
    measures: [],
    // Grams, or millilitres for a drink — close enough to grams for pricing,
    // and the basis names the serving it came from.
    servingGrams: offNumber(product, 'serving_quantity'),
  };
}

export async function searchOff(query: string): Promise<FoodMatch | null> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '3');
  url.searchParams.set('fields', 'code,product_name,generic_name,brands,nutriments,serving_size,serving_quantity');

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

// ── the databases, cached ───────────────────────────────────────────────────

export async function findInDatabase(
  db: SupabaseClient,
  query: string,
  source: 'usda' | 'off',
  branded = false,
): Promise<FoodMatch | null> {
  const cleaned = query.trim();
  if (!cleaned) return null;
  // Branded and generic USDA searches answer differently; cache them apart.
  const key = branded && source === 'usda' ? `${cleaned} #branded` : cleaned;

  const cached = await cacheGet(db, key, source);
  if (cached) return cached;

  try {
    const match = source === 'usda' ? await searchUsda(cleaned, branded) : await searchOff(cleaned);
    if (match) await cachePut(db, key, match);
    return match;
  } catch (_err) {
    // A source being down is not a reason to fail the parse; the caller moves
    // on to the next source and, failing all, to "set by hand".
    return null;
  }
}

/** The first database in `order` that knows the food. */
export async function findFood(
  db: SupabaseClient,
  query: string,
  order: LookupSource[] = ['usda', 'off'],
): Promise<FoodMatch | null> {
  for (const source of order) {
    if (source === 'openai') continue;
    const match = await findInDatabase(db, query, source);
    if (match) return match;
  }
  return null;
}

// ── OpenAI estimates ────────────────────────────────────────────────────────

interface Estimate {
  index: number;
  interpreted_as: string;
  assumed_portion: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
}

const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'interpreted_as', 'assumed_portion', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'],
        properties: {
          index: { type: 'integer' },
          interpreted_as: { type: 'string', description: 'The specific food you estimated, e.g. "Large egg, scrambled in butter".' },
          assumed_portion: { type: 'string', description: 'The portion the numbers are for, e.g. "2 large eggs (~100 g)".' },
          kcal: { type: ['number', 'null'], description: 'Energy for that portion; null if you cannot say.' },
          protein_g: { type: ['number', 'null'] },
          carbs_g: { type: ['number', 'null'], description: 'Total carbohydrate, fibre included.' },
          fat_g: { type: ['number', 'null'] },
          fiber_g: { type: ['number', 'null'] },
        },
      },
    },
  },
};

/**
 * Asks OpenAI for energy and macros, one call for every item still unpriced.
 * Each figure comes back labelled as an estimate, with what the model took the
 * food to be and the portion it assumed, so the review screen can show both.
 */
export async function estimateWithOpenAI(
  items: ItemIn[],
): Promise<(Omit<PricedItem, 'name' | 'portion'> | null)[]> {
  if (!items.length || !openAIKey()) return items.map(() => null);

  const list = items
    .map((item, index) => {
      const what = item.brand ? `${item.name} (brand: ${item.brand})` : item.name;
      const amount = item.portion
        ? `portion: ${item.portion}${item.grams_estimate ? ` (≈ ${item.grams_estimate} g)` : ''}`
        : 'no portion given';
      return `${index}. ${what} — ${amount}`;
    })
    .join('\n');

  let parsed: { items: Estimate[] };
  try {
    parsed = await chatJSON<{ items: Estimate[] }>({
      model: NUTRITION_MODEL,
      name: 'nutrition_estimates',
      schema: ESTIMATE_SCHEMA,
      system: [
        'You estimate the energy and macronutrients of foods a person has eaten, for a calorie log that values accuracy and honesty over completeness.',
        'Work from typical USDA FoodData Central values for the most likely interpretation of each food. For a named brand, use that product\'s label values.',
        'Use the stated portion. If none is given, assume one typical serving and say exactly what you assumed.',
        'Carbohydrate is total carbohydrate, fibre included. Round kcal to the nearest whole number and grams to one decimal.',
        'If a food is too ambiguous to estimate responsibly, return null values rather than a guess.',
        'Return one entry per input line, with the same index.',
      ].join('\n'),
      user: list,
    });
  } catch (_err) {
    return items.map(() => null);
  }

  return items.map((_item, index) => {
    const est = parsed.items?.find((e) => e.index === index);
    if (!est || est.kcal == null || !Number.isFinite(Number(est.kcal))) return null;
    const num = (v: number | null) => (v == null || !Number.isFinite(Number(v)) ? null : round1(Number(v)));
    const item = items[index];
    return {
      kcal: Math.round(Number(est.kcal)),
      match_source: 'openai' as const,
      match_ref: NUTRITION_MODEL,
      matched_name: est.interpreted_as || null,
      basis: `OpenAI estimate for ${est.assumed_portion || 'one serving'}`,
      grams: item.grams_estimate ?? null,
      portion_source: 'estimate' as const,
      protein_g: num(est.protein_g),
      carbs_g: num(est.carbs_g),
      fat_g: num(est.fat_g),
      fiber_g: num(est.fiber_g),
    };
  });
}

// ── the thing the functions actually call ───────────────────────────────────

export interface ItemIn extends Partial<Macros> {
  /** What it was, for the log: "Greek yogurt", "Red Bull". */
  name: string;
  /** The amount as said: "about a cup", "half", "a tablespoon". */
  portion?: string | null;
  kcal?: number | null;
  /** What to search the databases for, when it differs from the name: "yogurt, plain, whole milk". */
  query?: string | null;
  /** A named brand: "Red Bull", "Kellogg's". Brand-specific items are looked up as products. */
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  /** The parser's estimate of the whole portion's weight. */
  grams_estimate?: number | null;
  /** "about", "a handful", "a bowl": nobody weighed it. */
  approximate?: boolean;
}

/** Brand-specific items go to the product databases first: Open Food Facts, then USDA Branded. */
function orderFor(item: ItemIn, order: LookupSource[]): LookupSource[] {
  if (!item.brand) return order;
  const dbs = order.filter((s) => s !== 'openai');
  const ranked = [...dbs.filter((s) => s === 'off'), ...dbs.filter((s) => s !== 'off')];
  return order.map((s) => (s === 'openai' ? s : ranked.shift()!));
}

function searchText(item: ItemIn): string {
  const base = (item.query ?? item.name).trim();
  if (!item.brand) return base;
  return base.toLowerCase().includes(item.brand.toLowerCase()) ? base : `${item.brand} ${base}`;
}

export async function priceItems(
  db: SupabaseClient,
  items: ItemIn[],
  order: LookupSource[],
): Promise<PricedItem[]> {
  const priced: (PricedItem | null)[] = items.map((item) =>
    item.kcal != null && Number.isFinite(Number(item.kcal))
      ? {
          // A number the person wrote down is theirs; it is recorded as such.
          name: item.name,
          portion: item.portion ?? null,
          kcal: Math.round(Number(item.kcal)),
          match_source: 'manual',
          match_ref: null,
          matched_name: null,
          basis: 'stated in the log',
          grams: item.grams_estimate ?? null,
          portion_source: null,
          protein_g: item.protein_g ?? null,
          carbs_g: item.carbs_g ?? null,
          fat_g: item.fat_g ?? null,
          fiber_g: item.fiber_g ?? null,
        }
      : null,
  );

  // Each item walks its own source order — a branded item tries the product
  // databases first — and OpenAI is asked, once for all, only about what the
  // sources ahead of it could not find.
  const orders = items.map((item) => orderFor(item, order));
  const steps = Math.max(...orders.map((o) => o.length), 0);

  for (let step = 0; step < steps; step++) {
    const askAI: number[] = [];

    for (let i = 0; i < items.length; i++) {
      if (priced[i]) continue;
      const source = orders[i][step];
      if (!source) continue;
      if (source === 'openai') {
        askAI.push(i);
        continue;
      }
      const match = await findInDatabase(db, searchText(items[i]), source, Boolean(items[i].brand));
      if (!match) continue;
      const price = priceFor(match, items[i].portion ?? null, items[i]);
      if (price.kcal === null) continue;
      priced[i] = {
        name: items[i].name,
        portion: items[i].portion ?? null,
        kcal: price.kcal,
        match_source: match.source,
        match_ref: match.ref,
        matched_name: match.brand ? `${match.name} (${match.brand})` : match.name,
        basis: price.basis,
        grams: price.grams,
        portion_source: price.portion_source,
        ...price.macros,
      };
    }

    if (askAI.length) {
      const estimates = await estimateWithOpenAI(askAI.map((i) => items[i]));
      estimates.forEach((est, k) => {
        if (!est) return;
        const i = askAI[k];
        priced[i] = { name: items[i].name, portion: items[i].portion ?? null, ...est };
      });
    }
  }

  return priced.map(
    (p, i) =>
      p ?? {
        name: items[i].name,
        portion: items[i].portion ?? null,
        kcal: null,
        match_source: 'manual',
        match_ref: null,
        matched_name: null,
        basis: null,
        grams: items[i].grams_estimate ?? null,
        portion_source: items[i].grams_estimate ? 'estimate' : null,
        ...NO_MACROS,
      },
  );
}

/** "USDA · 2 matches · OpenAI estimate · 1 to price by hand" */
export function matchNote(priced: PricedItem[]): string {
  const count = (s: FoodSource) => priced.filter((p) => p.kcal !== null && p.match_source === s).length;
  const usda = count('usda');
  const off = count('off');
  const ai = count('openai');
  const stated = priced.filter((p) => p.kcal !== null && p.basis === 'stated in the log').length;
  const unmatched = priced.filter((p) => p.kcal === null).length;

  const parts: string[] = [];
  if (usda) parts.push(`USDA · ${usda} match${usda > 1 ? 'es' : ''}`);
  if (off) parts.push(`Open Food Facts · ${off}`);
  if (ai) parts.push(`OpenAI estimate · ${ai}`);
  if (stated) parts.push(`${stated} as written`);
  if (unmatched) parts.push(`${unmatched} to price by hand`);
  return parts.join(' · ') || 'no match — set by hand';
}
